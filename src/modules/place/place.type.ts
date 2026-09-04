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
  image_indices: v.pipe(
    v.array(v.number()),
    v.description(
      "0-based indices of the provided images that show THIS place, in the order the images were given. Assign each image to at most one place. Return an empty array when no image clearly shows this place.",
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
   * 이 장소에 해당하는 이미지의 공개 URL. 모델이 고른 인덱스를 검증해 추린 값이라
   * 게시글 전체 이미지의 부분집합이다. 고르지 못했으면 전체로 폴백한다.
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
