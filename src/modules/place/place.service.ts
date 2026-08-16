import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { AiService } from "../../infrastructures/ai/ai.service";
import type { ContentPart } from "../../infrastructures/ai/ai.type";
import { GeocoderService } from "../../infrastructures/geocoder/geocoder.service";
import { PlaceImageService } from "../../infrastructures/place-image/place-image.service";
import type { StoredImage } from "../../infrastructures/place-image/place-image.type";
import { ScraperService } from "../../infrastructures/scraper/scraper.service";
import type { ScrapedPost } from "../../infrastructures/scraper/scraper.type";
import {
  type ExtractedPlace,
  type PlaceMatch,
  type PlaceQuery,
  placeExtractionSchema,
} from "./place.type";

@Injectable()
export class PlaceService {
  private static readonly EXTRACTION_PROMPT =
    `You are a place extraction assistant for Instagram posts.
Analyze the caption and images to identify every distinct real-world place featured in the post, and fill in the structured fields for each according to their descriptions.
For area_type, choose "address" only when area_name is a concrete street address, "region" for a broad district or city, and "landmark" for a well-known nearby place; when unsure, prefer "region".
When area_type is "address", make area_name as complete a street address as the content allows so it can be geocoded precisely.
Write place_name and area_name the way local maps label the place: Korean when country_code is "KR", and the local language or English otherwise — never a Korean transliteration of a foreign name, because those do not match map listings.
Write relation in the same language as the source content (use Korean when the content is Korean).`;

  constructor(
    private readonly scraperService: ScraperService,
    private readonly aiService: AiService,
    private readonly geocoderService: GeocoderService,
    private readonly placeImageService: PlaceImageService,
  ) {}

  /** Instagram URL → scrape → AI extraction → 국가 기준 지오코딩. */
  async extractFromUrl(url: string): Promise<PlaceMatch[]> {
    const post = await this.scraperService.fetchPost(url);
    const queries = await this.extractQueries(post);

    if (queries.length === 0) {
      return [];
    }

    const settled = await Promise.allSettled(
      queries.map((query) =>
        this.geocoderService.search({
          placeName: query.place_name,
          areaName: query.area_name,
          areaType: query.area_type,
          countryCode: query.country_code,
        }),
      ),
    );

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

    return queries.map((query, index) => {
      const result = settled[index];
      /*
       * provider가 매긴 순서를 그대로 둔다. Kakao는 주소 기준 거리순(sort=distance),
       * Google은 자체 relevance로 이미 정렬해서 주므로 우리가 다시 매기면 그 신호를 덮는다.
       */
      const matches = result.status === "fulfilled" ? result.value : [];
      return { extracted: this.toExtractedPlace(query), matches };
    });
  }

  private toExtractedPlace(query: PlaceQuery): ExtractedPlace {
    return {
      placeName: query.place_name,
      areaName: query.area_name,
      areaType: query.area_type,
      countryCode: query.country_code,
      relation: query.relation,
    };
  }

  private async extractQueries(post: ScrapedPost): Promise<PlaceQuery[]> {
    // 인스타 이미지는 Vertex가 URL로 못 읽으므로(robots 차단), GCS에 올려 gs://로 넘긴다.
    const images = await this.placeImageService.storePostImages(
      post.shortcode,
      post.imageUrls,
    );
    const content = this.buildContent(post, images);
    const { places } = await this.aiService.extract(
      placeExtractionSchema,
      content,
    );

    return places.map((place) => ({
      ...place,
      country_code: place.country_code.toUpperCase(),
    }));
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
}
