import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { AiService } from "../../infrastructures/ai/ai.service";
import type { ContentPart } from "../../infrastructures/ai/ai.type";
import { GeocoderService } from "../../infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../infrastructures/geocoder/geocoder.type";
import { InstagramService } from "../../infrastructures/instagram/instagram.service";
import type { ScrapedPost } from "../../infrastructures/instagram/instagram.type";
import {
  type PlaceCandidate,
  type PlaceQuery,
  placeExtractionSchema,
} from "./place.type";

const PROVIDER_PRIORITY: Record<GeoCandidate["provider"], number> = {
  kakao: 0,
  google: 1,
};

@Injectable()
export class PlaceService {
  private static readonly EXTRACTION_PROMPT =
    `You are a place extraction assistant for Instagram posts.
Analyze the caption and images to identify every distinct real-world place featured in the post, and fill in the structured fields for each according to their descriptions.
Respond in the same language as the source content (use Korean when the content is Korean).`;

  constructor(
    private readonly instagramService: InstagramService,
    private readonly aiService: AiService,
    private readonly geocoderService: GeocoderService,
  ) {}

  /** Instagram URL → scrape → AI extraction → geocoding fan-out → ranking. */
  async extractFromUrl(url: string): Promise<PlaceCandidate[]> {
    const post = await this.instagramService.fetchPost(url);
    const queries = await this.extractQueries(post);

    const settled = await Promise.allSettled(
      queries.map((query) =>
        this.geocoderService.searchAll({
          placeName: query.place_name,
          areaName: query.area_name,
        }),
      ),
    );
    const succeeded = settled.filter(
      (result): result is PromiseFulfilledResult<GeoCandidate[]> =>
        result.status === "fulfilled",
    );

    // 부분 실패는 허용하고, 쿼리가 있었는데 전부 실패한 경우만 에러로 취급한다.
    if (queries.length > 0 && succeeded.length === 0) {
      throw new AppException(
        "GEOCODER_ALL_FAILED",
        "장소 검색이 모두 실패했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }

    const candidates = succeeded.flatMap((result) => result.value);

    if (candidates.length === 0) {
      throw new AppException(
        "GEOCODER_NO_RESULTS",
        "장소 검색 결과가 없습니다.",
        HttpStatus.NOT_FOUND,
      );
    }

    return this.rankCandidates(candidates);
  }

  private async extractQueries(post: ScrapedPost): Promise<PlaceQuery[]> {
    const content = this.buildContent(post);
    const { places } = await this.aiService.extract(
      placeExtractionSchema,
      content,
    );
    return places;
  }

  private buildContent(post: ScrapedPost): ContentPart[] {
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
    for (const imageUrl of post.imageUrls) {
      parts.push({ type: "image", url: imageUrl });
    }

    return parts;
  }

  /** Dedupes then orders by completeness → proximity → provider preference. */
  private rankCandidates(candidates: GeoCandidate[]): PlaceCandidate[] {
    return this.dedupe(candidates).sort((a, b) => {
      const completenessDiff = this.completeness(b) - this.completeness(a);
      if (completenessDiff !== 0) return completenessDiff;

      const distanceA = a.distance ?? Number.POSITIVE_INFINITY;
      const distanceB = b.distance ?? Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) return distanceA - distanceB;

      return PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider];
    });
  }

  private dedupe(candidates: GeoCandidate[]): GeoCandidate[] {
    const byKey = new Map<string, GeoCandidate>();

    for (const candidate of candidates) {
      const key = this.dedupeKey(candidate);
      const existing = byKey.get(key);
      byKey.set(
        key,
        existing ? this.merge(existing, candidate) : { ...candidate },
      );
    }

    return [...byKey.values()];
  }

  /** Two candidates are the "same place" when name + coordinate roughly match. */
  private dedupeKey(candidate: GeoCandidate): string {
    const name = candidate.placeName.trim().toLowerCase().replace(/\s+/g, " ");
    const lat = candidate.coordinate.lat.toFixed(4);
    const lng = candidate.coordinate.lng.toFixed(4);
    return `${name}@${lat},${lng}`;
  }

  private merge(base: GeoCandidate, extra: GeoCandidate): GeoCandidate {
    return {
      ...base,
      url: base.url ?? extra.url,
      phone: base.phone ?? extra.phone,
      category: base.category ?? extra.category,
      distance: base.distance ?? extra.distance,
    };
  }

  /** Counts how many optional fields are present (higher = more complete). */
  private completeness(candidate: GeoCandidate): number {
    let score = 0;
    if (candidate.url) score++;
    if (candidate.phone) score++;
    if (candidate.category) score++;
    if (candidate.distance !== undefined) score++;
    return score;
  }
}
