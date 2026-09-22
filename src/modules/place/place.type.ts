import * as v from "valibot";
import type {
  AreaType,
  GeoCandidate,
} from "../../infrastructures/geocoder/geocoder.type";

export const placeQuerySchema = v.object({
  place_name: v.pipe(
    v.string(),
    v.description(
      "The specific name of the place, e.g. a restaurant, cafe, or shop name.",
    ),
  ),
  area_name: v.pipe(
    v.string(),
    v.description(
      "The surrounding area, neighborhood, or address hint for the place.",
    ),
  ),
  area_type: v.pipe(
    v.picklist(["landmark", "address", "region"]),
    v.description(
      'How area_name is expressed: "landmark" for a well-known place, "address" for a street address, "region" for a broad area such as a district or city.',
    ),
  ),
  relation: v.pipe(
    v.string(),
    v.description(
      "A short phrase describing how the place relates to the post content.",
    ),
  ),
});

export type PlaceQuery = v.InferOutput<typeof placeQuerySchema>;

/** Wrapped in an object so structured output uses the provider-friendly object mode. */
export const placeExtractionSchema = v.object({
  places: v.pipe(
    v.array(placeQuerySchema),
    v.description("Every distinct real-world place featured in the post."),
  ),
});

export type PlaceExtractionResult = v.InferOutput<typeof placeExtractionSchema>;

/**
 * 이미지 한 장을 단독으로 보여주고 어느 장소인지 고르게 하는 2단계 스키마.
 *
 * 여러 장을 한 번에 넘기고 인덱스나 순서대로 된 배열을 받으면, 모델이 "몇 번째
 * 이미지인가"를 세다가 통째로 한 칸씩 밀린 답을 내놓곤 한다(캡션이 "1. … 2. …"
 * 처럼 번호를 매긴 글에서 특히). 한 장씩 물으면 셀 대상이 없어 밀릴 자리가 없고,
 * 답의 근거도 그 이미지에 찍힌 상호·간판·주소 자막이 된다.
 */
export const imagePlaceSchema = v.object({
  place_name: v.pipe(
    v.string(),
    v.description(
      "The place this image shows, copied verbatim from the candidate list. Empty string when none of the candidates clearly matches.",
    ),
  ),
});

export interface PlaceCandidate extends GeoCandidate {}

export interface ExtractedPlace {
  placeName: string;
  areaName: string;
  areaType: AreaType;
  relation: string;
}

export interface DuplicatedPlace {
  readonly pinId: string;
  readonly placeId: string;
  readonly placeName: string;
  readonly thumbnailUrl: string | null;
}

export interface PlaceMatch {
  /** 게시글에서 추출한 장소. */
  extracted: ExtractedPlace;
  /**
   * 이 장소에 해당하는 이미지의 공개 URL. 이미지별로 따로 물어 고른 값이라
   * 게시글 전체 이미지의 부분집합이다. 한 장도 못 고르면 전체로 폴백한다.
   */
  images: string[];
  /** 이 장소에 대한 지오코딩 후보(장소 내 랭킹순, 첫 번째가 최상위). 없으면 빈 배열. */
  matches: PlaceCandidate[];
  /** fulfilled 빈 배열과 provider 실패를 구분해 재시도 정책에 전달한다. */
  geocoding: { status: "fulfilled" } | { status: "rejected"; reason: unknown };
}

export interface PlaceExtraction {
  readonly matches: PlaceMatch[];
  /** 게시글 전체의 이미지 공개 URL. 장소별이 아니라 글 단위라 한 번만 싣는다. */
  readonly images: string[];
}
