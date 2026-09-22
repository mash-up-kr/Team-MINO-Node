import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { AiService } from "../../infrastructures/ai/ai.service";
import type { ContentPart } from "../../infrastructures/ai/ai.type";
import { GeocoderService } from "../../infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../infrastructures/geocoder/geocoder.type";
import { PlaceImageService } from "../../infrastructures/place-image/place-image.service";
import type { StoredImage } from "../../infrastructures/place-image/place-image.type";
import { ScraperService } from "../../infrastructures/scraper/scraper.service";
import type { ScrapedPost } from "../../infrastructures/scraper/scraper.type";
import {
  createPlaceExtractionSchema,
  type ExtractedPlace,
  type PlaceCandidate,
  type PlaceExtraction,
  type PlaceQuery,
} from "./place.type";

const PROVIDER_PRIORITY: Record<GeoCandidate["provider"], number> = {
  kakao: 0,
  google: 1,
};

@Injectable()
export class PlaceService {
  private readonly logger = new Logger(PlaceService.name);

  private static readonly EXTRACTION_PROMPT =
    `You are a place extraction assistant for Instagram posts.
Analyze the caption and images to identify every distinct real-world place featured in the post, and fill in the structured fields for each according to their descriptions.
For area_type, choose "address" only when area_name is a concrete street address, "region" for a broad district or city, and "landmark" for a well-known nearby place; when unsure, prefer "region".
When area_type is "address", make area_name as complete a street address as the content allows so it can be geocoded precisely.
The images are given in order, each preceded by an "[image N]" label. Walk through them in order and fill image_places with one entry per image.
Respond in the same language as the source content (use Korean when the content is Korean).`;

  constructor(
    private readonly scraperService: ScraperService,
    private readonly aiService: AiService,
    private readonly geocoderService: GeocoderService,
    private readonly placeImageService: PlaceImageService,
  ) {}

  /** Instagram URL → scrape → AI extraction → geocoding fan-out → ranking. */
  async extractFromUrl(url: string): Promise<PlaceExtraction> {
    const started = Date.now();
    const post = await this.scraperService.fetchPost(url);
    const scrapeMs = Date.now() - started;
    const { queries, images, imagePlaces, imageMs, aiMs } =
      await this.extractQueries(post);

    // 장소를 못 뽑아도 이미지는 이미 올라갔으므로 그대로 함께 돌려준다.
    if (queries.length === 0) {
      this.logStageTimings(
        { scrapeMs, imageMs, aiMs, geocodeMs: 0 },
        0,
        started,
      );
      return { matches: [], images };
    }

    const geocodeStarted = Date.now();
    const settled = await Promise.allSettled(
      queries.map((query) =>
        this.geocoderService.searchAll({
          placeName: query.place_name,
          areaName: query.area_name,
          areaType: query.area_type,
        }),
      ),
    );
    const geocodeMs = Date.now() - geocodeStarted;

    // 전부 reject된 경우만 인프라 오류로 취급(부분 실패·결과 없음은 정상 데이터).
    const anyFulfilled = settled.some(
      (result) => result.status === "fulfilled",
    );
    if (!anyFulfilled) {
      throw new AppException(
        "GEOCODER_ALL_FAILED",
        "장소 검색이 모두 실패했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }

    const imagesByPlaceName = this.groupImagesByPlaceName(imagePlaces, images);
    const matches = queries.map((query, index) => {
      const result = settled[index];
      // 짝이 없는 장소는 게시글 전체로 폴백한다(썸네일을 비우지 않는다).
      const placeImages = imagesByPlaceName.get(query.place_name) ?? images;
      if (result.status === "fulfilled") {
        return {
          extracted: this.toExtractedPlace(query),
          images: placeImages,
          matches: this.rankCandidates(result.value),
          geocoding: { status: "fulfilled" as const },
        };
      }
      return {
        extracted: this.toExtractedPlace(query),
        images: placeImages,
        matches: [],
        geocoding: { status: "rejected" as const, reason: result.reason },
      };
    });

    this.logStageTimings(
      { scrapeMs, imageMs, aiMs, geocodeMs },
      queries.length,
      started,
    );
    return { matches, images };
  }

  /*
   * 태스크 한 건이 Cloud Run 자리를 몇 초 잡는지가 유저 요청 지연으로 이어지므로
   * 어느 단계가 먹는지 남긴다. 단계별 측정이 없으면 느려졌을 때 손댈 곳을 못 찾는다.
   */
  private logStageTimings(
    timings: {
      scrapeMs: number;
      imageMs: number;
      aiMs: number;
      geocodeMs: number;
    },
    queryCount: number,
    started: number,
  ): void {
    // 단계 합산이면 랭킹 등 어느 단계에도 안 잡힌 구간이 빠지므로 실제 경과로 잰다.
    const totalMs = Date.now() - started;
    this.logger.log(
      { ...timings, totalMs, queryCount },
      "장소 추출 단계별 소요 시간",
    );
  }

  /**
   * 이미지 한 장당 한 칸인 모델 응답을 장소 이름 → 이미지 URL 목록으로 뒤집는다.
   *
   * 모델에게 인덱스를 고르게 하면 캡션이 "1. … 2. …"처럼 번호를 매긴 글에서
   * 통째로 한 칸 밀린 답이 돌아오곤 했다(장소마다 바로 다음 사진이 붙었다).
   * 번호를 세게 하지 않고 이미지 순서대로 한 칸씩 받아 위치로 짝짓는다.
   *
   * 칸 수가 이미지 수와 다르면 정렬이 깨진 것이므로 통째로 버린다. 어긋난 채
   * 짝지어 엉뚱한 사진을 붙이느니 게시글 전체로 폴백하는 쪽이 낫다.
   */
  private groupImagesByPlaceName(
    imagePlaces: string[],
    images: string[],
  ): Map<string, string[]> {
    const byPlaceName = new Map<string, string[]>();
    if (imagePlaces.length !== images.length) {
      // 스키마상 필수라 보통은 길이가 맞는다. 어긋나면 모델 쪽 이상 신호다.
      if (imagePlaces.length > 0) {
        this.logger.warn(
          { imagePlaces: imagePlaces.length, images: images.length },
          "이미지-장소 정렬이 어긋나 게시글 전체 이미지로 폴백합니다.",
        );
      }
      return byPlaceName;
    }

    imagePlaces.forEach((placeName, index) => {
      // 표지·아웃트로처럼 장소가 없는 컷은 빈 문자열로 온다.
      const trimmed = placeName.trim();
      if (!trimmed) return;
      const image = images[index] as string;
      const collected = byPlaceName.get(trimmed);
      if (collected) collected.push(image);
      else byPlaceName.set(trimmed, [image]);
    });

    return byPlaceName;
  }

  private toExtractedPlace(query: PlaceQuery): ExtractedPlace {
    return {
      placeName: query.place_name,
      areaName: query.area_name,
      areaType: query.area_type,
      relation: query.relation,
    };
  }

  /**
   * AI가 뽑은 장소와 함께, 이 게시글에서 저장된 이미지의 공개 URL을 돌려준다.
   * Vertex에는 gs://로 넘기지만 DB·클라이언트에는 https:// 쪽이 필요하다.
   */
  private async extractQueries(post: ScrapedPost): Promise<{
    queries: PlaceQuery[];
    images: string[];
    imagePlaces: string[];
    imageMs: number;
    aiMs: number;
  }> {
    // 인스타 이미지는 Vertex가 URL로 못 읽으므로(robots 차단), GCS에 올려 gs://로 넘긴다.
    const started = Date.now();
    const images = await this.placeImageService.storePostImages(
      post.shortcode,
      post.imageUrls,
    );
    const uploaded = Date.now();
    const content = this.buildContent(post, images);
    const { places, image_places } = await this.aiService.extract(
      createPlaceExtractionSchema(images.length),
      content,
    );
    return {
      queries: places,
      images: images.map((image) => image.publicUrl),
      imagePlaces: image_places ?? [],
      imageMs: uploaded - started,
      aiMs: Date.now() - uploaded,
    };
  }

  private buildContent(
    post: ScrapedPost,
    images: StoredImage[],
  ): ContentPart[] {
    const parts: ContentPart[] = [
      { type: "text", text: PlaceService.EXTRACTION_PROMPT },
    ];

    if (post.caption) {
      parts.push({ type: "text", text: `Caption:\n${post.caption}` });
    }
    if (post.location?.name) {
      parts.push({
        type: "text",
        text: `Tagged location: ${post.location.name}`,
      });
    }
    /*
     * 장수를 못 박아 둔다. 칸 수가 이미지 수와 어긋나면 짝을 못 지어 전체 폴백으로
     * 떨어지는데, 이 한 줄이 있고 없고로 어긋나는 빈도가 눈에 띄게 달랐다.
     */
    parts.push({
      type: "text",
      text: `You are given ${images.length} images. image_places must have exactly ${images.length} entries.`,
    });
    images.forEach((image, index) => {
      // 응답(image_places)의 몇 번째 칸인지 모델이 놓치지 않도록 번호를 붙여 둔다.
      parts.push({ type: "text", text: `[image ${index}]` });
      parts.push({
        type: "image",
        url: image.gsUri,
        mediaType: image.mediaType,
      });
    });

    return parts;
  }

  /** Orders by completeness → proximity → provider preference. */
  private rankCandidates(candidates: GeoCandidate[]): PlaceCandidate[] {
    return candidates.sort((a, b) => {
      const completenessDiff = this.completeness(b) - this.completeness(a);
      if (completenessDiff !== 0) return completenessDiff;

      const distanceA = a.distance ?? Number.POSITIVE_INFINITY;
      const distanceB = b.distance ?? Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) return distanceA - distanceB;

      return PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider];
    });
  }

  /** Counts how many optional fields are present (higher = more complete). */
  private completeness(candidate: GeoCandidate): number {
    let score = 0;
    if (candidate.mapUrl) score++;
    if (candidate.phone) score++;
    if (candidate.category) score++;
    if (candidate.distance !== undefined) score++;
    return score;
  }
}
