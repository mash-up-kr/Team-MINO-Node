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
  type ExtractedPlace,
  imagePlaceSchema,
  type PlaceCandidate,
  type PlaceExtraction,
  type PlaceQuery,
  placeExtractionSchema,
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
Respond in the same language as the source content (use Korean when the content is Korean).`;

  /*
   * 2단계 프롬프트. 이미지 한 장과 후보 목록만 주고 고르게 한다. 여러 장을 한꺼번에
   * 넘기지 않으므로 모델이 순서를 셀 일이 없고, 판단 근거가 그 이미지에 찍힌
   * 상호·간판·주소 자막이 된다(큐레이션 글은 대개 사진 위에 상호를 적어 둔다).
   */
  private static readonly IMAGE_PLACE_PROMPT =
    `This image is from an Instagram post about places.
Read any text printed on the image (place name, signage, address caption) and decide which place from the list below it shows.
Rely on what is visible in THIS image. If none of them clearly matches, answer with an empty string.`;

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
    const { queries, images, imageMs, aiMs } = await this.extractQueries(post);
    const imageUrls = images.map((image) => image.publicUrl);

    // 장소를 못 뽑아도 이미지는 이미 올라갔으므로 그대로 함께 돌려준다.
    if (queries.length === 0) {
      this.logStageTimings(
        { scrapeMs, imageMs, aiMs, assignMs: 0, geocodeMs: 0 },
        0,
        started,
      );
      return { matches: [], images: imageUrls };
    }

    // 지오코딩과 이미지 짝짓기는 서로를 기다릴 이유가 없다.
    const assignStarted = Date.now();
    const geocodeStarted = assignStarted;
    const [settled, imagesByPlaceName] = await Promise.all([
      Promise.allSettled(
        queries.map((query) =>
          this.geocoderService.searchAll({
            placeName: query.place_name,
            areaName: query.area_name,
            areaType: query.area_type,
          }),
        ),
      ),
      this.assignImagesToPlaces(
        images,
        queries.map((query) => query.place_name),
      ),
    ]);
    const geocodeMs = Date.now() - geocodeStarted;
    const assignMs = Date.now() - assignStarted;

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

    const matches = queries.map((query, index) => {
      const result = settled[index];
      // 어느 컷에서도 안 보인 장소는 게시글 전체로 폴백한다(썸네일을 비우지 않는다).
      const placeImages = imagesByPlaceName.get(query.place_name) ?? imageUrls;
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
      { scrapeMs, imageMs, aiMs, assignMs, geocodeMs },
      queries.length,
      started,
    );
    return { matches, images: imageUrls };
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
      assignMs: number;
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
   * 이미지 한 장씩 따로 물어 "이 사진은 어느 장소인가"를 받고, 장소 이름으로 묶는다.
   *
   * 여러 장을 한 번에 넘기고 인덱스나 순서 배열을 받으면 모델이 몇 번째인지를 세다가
   * 통째로 한 칸 밀린 답을 내놓는다(IMAGE_PLACE_PROMPT 참고). 한 장씩 물으면 셀
   * 대상이 없어 밀릴 자리가 없다.
   *
   * 한 장의 실패는 그 장만 버린다 — 나머지 짝짓기와 저장까지 같이 무를 이유가 없다.
   */
  private async assignImagesToPlaces(
    images: StoredImage[],
    placeNames: string[],
  ): Promise<Map<string, string[]>> {
    const byPlaceName = new Map<string, string[]>();
    if (images.length === 0 || placeNames.length === 0) return byPlaceName;

    const candidates = placeNames.map((name) => `- ${name}`).join("\n");
    const picked = await Promise.all(
      images.map(async (image) => {
        try {
          const { place_name } = await this.aiService.extract(
            imagePlaceSchema,
            [
              {
                type: "text",
                text: `${PlaceService.IMAGE_PLACE_PROMPT}\n\nCandidates:\n${candidates}`,
              },
              {
                type: "image",
                url: image.gsUri,
                mediaType: image.mediaType,
              },
            ],
          );
          return place_name?.trim() ?? "";
        } catch (error) {
          this.logger.warn(
            { err: error, image: image.publicUrl },
            "이미지 장소 판별 실패 — 이 이미지는 건너뜁니다.",
          );
          return "";
        }
      }),
    );

    picked.forEach((placeName, index) => {
      // 표지·아웃트로처럼 후보에 없는 컷은 빈 문자열로 온다.
      // 후보 목록 밖의 이름도 짝지을 곳이 없으므로 같이 버린다.
      if (!placeName || !placeNames.includes(placeName)) return;
      const image = images[index] as StoredImage;
      const collected = byPlaceName.get(placeName);
      if (collected) collected.push(image.publicUrl);
      else byPlaceName.set(placeName, [image.publicUrl]);
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
    images: StoredImage[];
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
    const { places } = await this.aiService.extract(
      placeExtractionSchema,
      content,
    );
    return {
      queries: places,
      images,
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
    for (const image of images) {
      parts.push({
        type: "image",
        url: image.gsUri,
        mediaType: image.mediaType,
      });
    }

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
