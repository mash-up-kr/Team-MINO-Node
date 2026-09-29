import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { AiService } from "../../infrastructures/ai/ai.service";
import type { ContentPart } from "../../infrastructures/ai/ai.type";
import { GeocoderService } from "../../infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../infrastructures/geocoder/geocoder.type";
import { PlaceImageService } from "../../infrastructures/place-image/place-image.service";
import type {
  StoredImage,
  StoredVideo,
} from "../../infrastructures/place-image/place-image.type";
import { ScraperService } from "../../infrastructures/scraper/scraper.service";
import type { ScrapedPost } from "../../infrastructures/scraper/scraper.type";
import {
  createPlaceExtractionSchema,
  type ExtractedPlace,
  type ImagePlace,
  type PlaceCandidate,
  type PlaceExtraction,
  type PlaceKind,
  type PlaceQuery,
  reelExtractionSchema,
} from "./place.type";

const PROVIDER_PRIORITY: Record<GeoCandidate["provider"], number> = {
  kakao: 0,
  google: 1,
};

/** 추출 단계의 결과. imagePlaces는 사진 게시글에서만 채워진다(릴스는 썸네일 1장이라 빈 배열). */
interface ExtractedQueries {
  queries: PlaceQuery[];
  imagePlaces: ImagePlace[];
}

@Injectable()
export class PlaceService {
  private readonly logger = new Logger(PlaceService.name);

  private static readonly EXTRACTION_PROMPT =
    `You are a place extraction assistant for Instagram posts.
Analyze the caption and images to identify every distinct real-world place featured in the post, and fill in the structured fields for each according to their descriptions.
For area_type, choose "address" only when area_name is a concrete street address, "region" for a broad district or city, and "landmark" for a well-known nearby place; when unsure, prefer "region".
When area_type is "address", make area_name as complete a street address as the content allows so it can be geocoded precisely.
The images are given in order, each preceded by an "[image N]" label. Produce one image_places object per image, in that order: copy the label number into image_index, transcribe the text printed on the image into visible_text, then decide which place it shows and copy that place's place_name and area_name verbatim.
Respond in the same language as the source content (use Korean when the content is Korean).`;

  /*
   * 영상(릴스) 전용 프롬프트. 사진 프롬프트와 달리 무엇을 볼지 지정하지 않는다.
   *
   * 용산 코스 릴스(실제 9개 코스) 기준 — 넓게 찾게 하면 10~11곳을 안정적으로 뽑는데,
   * "자막·내레이션을 옮겨 적어라"처럼 단서를 못 박으면 간판·로고·지도 화면·키오스크
   * 같은 다른 단서를 버려 4곳으로 떨어졌고, "방문 가능한 곳만"으로 제한하면 실제 매장이
   * 같이 빠져 6~9곳 사이를 오갔다. 그래서 넓게 찾게 두고 종류(kind)만 붙여 받아 서버가
   * 거른다.
   */
  private static readonly REEL_EXTRACTION_PROMPT =
    `Explore this Instagram Reel thoroughly — the video, its audio, the thumbnail, and the caption — and identify every distinct real-world place featured (shops, cafes, restaurants, venues, attractions). For each, say exactly what you identified it from, and label what kind of place it is.
For area_type, choose "address" only when area_name is a concrete street address, "region" for a broad district or city, and "landmark" for a well-known nearby place; when unsure, prefer "region".
When area_type is "address", make area_name as complete a street address as the content allows so it can be geocoded precisely.
Respond in the same language as the source content (use Korean when the content is Korean).`;

  // 1분 안팎 영상이 5~25초 걸렸다(사진은 2~6초). 기본 30초로는 잘린다.
  private static readonly REEL_AI_TIMEOUT_MS = 120_000;

  /*
   * 릴스 추출을 같은 자리에서 다시 부르는 횟수. AI_SCHEMA_MISMATCH처럼 "다시 부르면 될 수
   * 있다"고 명시된 실패에만 쓴다. 태스크를 재배달받는 것보다 싸고, 그래도 안 되면 폴백한다.
   */
  private static readonly REEL_RETRY_LIMIT = 1;

  // 저장할 장소가 아니다. 역 출구는 길 안내로 나오고, 방송사·집은 갈 수 있는 곳이 아니다.
  private static readonly EXCLUDED_KINDS: ReadonlySet<PlaceKind> = new Set([
    "transit",
    "media_or_brand",
    "private_or_not_a_place",
  ]);

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
    const { queries, images, imagePlaces, imageMs, videoMs, aiMs } =
      await this.extractQueries(post);

    // 장소를 못 뽑아도 이미지는 이미 올라갔으므로 그대로 함께 돌려준다.
    if (queries.length === 0) {
      this.logStageTimings(
        { scrapeMs, imageMs, videoMs, aiMs, geocodeMs: 0 },
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

    const imagesByPlace = this.groupImagesByPlace(imagePlaces, images, queries);
    const matches = queries.map((query, index) => {
      const result = settled[index];
      // 짝이 없는 장소는 게시글 전체로 폴백한다(썸네일을 비우지 않는다).
      const placeImages = imagesByPlace.get(index) ?? images;
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
      { scrapeMs, imageMs, videoMs, aiMs, geocodeMs },
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
      // 릴스만 0보다 크다. 이미지와 병렬로 올리므로 둘 중 큰 쪽이 실제 대기 시간이다.
      videoMs: number;
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
   * 이미지별 응답을 장소 이름 → 이미지 URL 목록으로 뒤집는다.
   *
   * 짝짓기는 모델이 적어 낸 image_index로 한다. 배열 순서만 믿으면 한 칸이 밀렸을 때
   * 뒤가 전부 어긋나지만, 칸마다 자기 번호를 들고 있으면 이상한 칸만 골라낼 수 있다.
   * 범위 밖·중복·비정수는 그 칸만 버리고 나머지 짝짓기는 그대로 둔다.
   *
   * place_name은 보통 places의 값을 그대로 복사해 오는데, 가끔 "광화문 아이갓에브리씽"
   * 처럼 지역을 덧붙인다. 그래서 정확히 일치하지 않으면 포함 관계로 한 번 더 본다.
   */
  private groupImagesByPlace(
    imagePlaces: ImagePlace[],
    images: string[],
    queries: PlaceQuery[],
  ): Map<number, string[]> {
    const byPlace = new Map<number, string[]>();
    const taken = new Set<number>();

    for (const entry of imagePlaces) {
      const index = entry.image_index;
      if (!Number.isInteger(index) || index < 0 || index >= images.length) {
        continue;
      }
      // 같은 사진을 두 칸이 가져가면 어느 쪽이 맞는지 알 수 없다 — 먼저 온 쪽만 남긴다.
      if (taken.has(index)) continue;

      const placeIndex = this.resolvePlaceIndex(entry, queries);
      // 표지·아웃트로처럼 장소가 없는 컷은 빈 문자열로 온다.
      if (placeIndex === undefined) continue;

      taken.add(index);
      const image = images[index] as string;
      const collected = byPlace.get(placeIndex);
      if (collected) collected.push(image);
      else byPlace.set(placeIndex, [image]);
    }

    return byPlace;
  }

  /**
   * 모델이 답한 장소를 queries의 몇 번째인지로 되돌린다. 못 되돌리면 undefined.
   *
   * 이름을 키로 쓰지 않는 이유: 한 게시글에 "스타벅스"가 두 곳(강남/홍대) 나올 수
   * 있고, 그러면 두 장소가 서로의 사진을 나눠 갖는다. 이름이 겹치면 지역으로 가르고,
   * 그래도 못 가르면 사진을 섞느니 그 칸을 버린다.
   */
  private resolvePlaceIndex(
    entry: ImagePlace,
    queries: PlaceQuery[],
  ): number | undefined {
    const byName = this.matchIndexes(
      queries.map((query) => query.place_name),
      entry.place_name.trim(),
    );
    if (byName.length <= 1) return byName[0];

    const byArea = this.matchIndexes(
      byName.map((index) => queries[index]?.area_name ?? ""),
      entry.area_name.trim(),
    );
    return byArea.length === 1 ? byName[byArea[0] as number] : undefined;
  }

  /**
   * 정확히 일치하는 후보들, 없으면 포함 관계로 한 번 더 본다.
   * 모델이 "광화문 아이갓에브리씽"처럼 지역을 덧붙여 답하는 경우를 받아낸다.
   */
  private matchIndexes(candidates: string[], answer: string): number[] {
    if (!answer) return [];
    const exact = candidates.flatMap((candidate, index) =>
      candidate === answer ? [index] : [],
    );
    if (exact.length > 0) return exact;
    return candidates.flatMap((candidate, index) =>
      candidate && answer.includes(candidate) ? [index] : [],
    );
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
    imagePlaces: ImagePlace[];
    imageMs: number;
    videoMs: number;
    aiMs: number;
  }> {
    // 인스타 미디어는 Vertex가 URL로 못 읽으므로(robots 차단), GCS에 올려 gs://로 넘긴다.
    // 이미지와 영상은 서로 기다릴 이유가 없어 함께 올린다.
    const started = Date.now();
    let imageMs = 0;
    let videoMs = 0;
    const [images, video] = await Promise.all([
      this.placeImageService
        .storePostImages(post.shortcode, post.imageUrls)
        .then((stored) => {
          imageMs = Date.now() - started;
          return stored;
        }),
      // 영상 게시글은 썸네일 1장으로는 소개 장소를 못 본다. 영상을 올려 함께 넘긴다.
      post.typename === "video" && post.videoUrl
        ? this.placeImageService
            .storePostVideo(post.shortcode, post.videoUrl)
            .then((stored) => {
              videoMs = Date.now() - started;
              return stored;
            })
        : null,
    ]);
    const uploaded = Date.now();

    // 영상을 못 올렸으면 사진 경로로 내려간다 — 캡션·썸네일만으로도 추출은 된다.
    const { queries, imagePlaces } = video
      ? await this.extractFromReelOrFallback(post, images, video)
      : await this.extractFromImages(post, images);

    return {
      queries,
      images: images.map((image) => image.publicUrl),
      imagePlaces,
      imageMs,
      videoMs,
      aiMs: Date.now() - uploaded,
    };
  }

  /** 사진 게시글 경로. 릴스가 영상으로 실패했을 때의 안전망이기도 하다. */
  private async extractFromImages(
    post: ScrapedPost,
    images: StoredImage[],
  ): Promise<ExtractedQueries> {
    const { places, image_places } = await this.aiService.extract(
      createPlaceExtractionSchema(images.length),
      this.buildContent(post, images),
    );
    return { queries: places, imagePlaces: image_places ?? [] };
  }

  /**
   * 릴스 추출이 실패하면 캡션·썸네일 경로로 내려간다.
   *
   * 영상이 거부되는 이유(코덱·길이·400)는 재시도해도 같아서, 그대로 올리면 재시도를
   * 다 쓰고 실패 알림으로 끝난다. 그 글은 지금 코드로도 캡션만으로 몇 핀은 잡던 글이라
   * 기능이 뒤로 가는 셈이다.
   *
   * 예외 둘. 타임아웃은 다음 배달에서 될 수 있으니 그대로 올린다. 모델 출력이 스키마에
   * 안 맞은 것(retryable을 명시한 실패)은 비결정적이라 여기서 한 번 더 부른다 — 바로
   * 폴백하면 잠깐의 흔들림에 영상 결과를 통째로 버리는 셈이다.
   */
  private async extractFromReelOrFallback(
    post: ScrapedPost,
    images: StoredImage[],
    video: StoredVideo,
  ): Promise<ExtractedQueries> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.extractFromReel(post, images, video);
      } catch (error) {
        const appError = error instanceof AppException ? error : undefined;
        if (appError?.errorCode === "AI_TIMEOUT") throw error;

        if (appError?.retryable && attempt < PlaceService.REEL_RETRY_LIMIT) {
          this.logger.warn(
            { err: error, shortcode: post.shortcode, attempt },
            "릴스 추출 실패 — 같은 자리에서 다시 부른다",
          );
          continue;
        }

        this.logger.warn(
          { err: error, shortcode: post.shortcode, attempt },
          "릴스 추출 실패 — 캡션·썸네일 경로로 폴백",
        );
        return this.extractFromImages(post, images);
      }
    }
  }

  /**
   * 릴스: 영상까지 넘겨 넓게 찾고, 저장할 수 없는 종류만 걸러 사진 경로와 같은 모양으로 맞춘다.
   */
  private async extractFromReel(
    post: ScrapedPost,
    images: StoredImage[],
    video: StoredVideo,
  ): Promise<ExtractedQueries> {
    const parts: ContentPart[] = [
      { type: "text", text: PlaceService.REEL_EXTRACTION_PROMPT },
      ...this.buildContext(post),
    ];
    for (const image of images) {
      parts.push({
        type: "image",
        url: image.gsUri,
        mediaType: image.mediaType,
      });
    }
    parts.push({ type: "video", url: video.gsUri, mediaType: video.mediaType });

    const { places } = await this.aiService.extract(
      reelExtractionSchema,
      parts,
      { timeoutMs: PlaceService.REEL_AI_TIMEOUT_MS },
    );
    // 걸러낸 것을 남겨 둔다. 필터가 실제 매장을 잘못 거르는지, 프롬프트를 손볼 근거가 된다.
    const excluded = places.filter((place) =>
      PlaceService.EXCLUDED_KINDS.has(place.kind),
    );
    if (excluded.length > 0) {
      this.logger.log(
        {
          shortcode: post.shortcode,
          excluded: excluded.map(({ place_name, kind, evidence }) => ({
            place_name,
            kind,
            evidence,
          })),
        },
        "릴스 추출에서 걸러낸 장소",
      );
    }

    return {
      queries: places
        .filter((place) => !PlaceService.EXCLUDED_KINDS.has(place.kind))
        .map(({ kind: _kind, evidence: _evidence, ...query }) => query),
      // 썸네일 1장이라 고를 사진이 없다. 비워 두면 모든 장소가 전체(=썸네일)로 폴백한다.
      imagePlaces: [],
    };
  }

  /** 프롬프트 뒤에 붙는 게시글 텍스트 맥락(캡션·태그 위치). 사진·영상 경로가 공유한다. */
  private buildContext(post: ScrapedPost): ContentPart[] {
    const parts: ContentPart[] = [];
    if (post.caption) {
      parts.push({ type: "text", text: `Caption:\n${post.caption}` });
    }
    if (post.location?.name) {
      parts.push({
        type: "text",
        text: `Tagged location: ${post.location.name}`,
      });
    }
    return parts;
  }

  private buildContent(
    post: ScrapedPost,
    images: StoredImage[],
  ): ContentPart[] {
    const parts: ContentPart[] = [
      { type: "text", text: PlaceService.EXTRACTION_PROMPT },
      ...this.buildContext(post),
    ];
    /*
     * 장수를 못 박아 둔다. 칸 수가 이미지 수와 어긋나면 짝을 못 지어 전체 폴백으로
     * 떨어지는데, 이 한 줄이 있고 없고로 어긋나는 빈도가 눈에 띄게 달랐다.
     */
    parts.push({
      type: "text",
      text: `You are given ${images.length} images. image_places must have exactly ${images.length} objects.`,
    });
    images.forEach((image, index) => {
      // 모델이 image_index에 그대로 옮겨 적을 번호다.
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
