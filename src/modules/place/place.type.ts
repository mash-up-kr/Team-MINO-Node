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
      'Indices of the provided images that show THIS place, taken from the "[image N]" label that precedes each image. Assign each image to at most one place. Return an empty array when no image clearly shows this place.',
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
 * 영상(릴스) 추출에서 장소의 종류.
 *
 * 릴스는 "무엇이든 찾아라"고 넓게 시켜야 회수가 난다(단서를 지정하거나 "방문 가능한
 * 곳만"으로 제한하면 실제 매장까지 같이 빠졌다). 대신 종류를 스스로 붙이게 해서,
 * 방송사·집·역 출구처럼 저장할 수 없는 것을 서버가 거른다.
 */
export const PLACE_KINDS = [
  "venue",
  "landmark",
  "transit",
  "media_or_brand",
  "private_or_not_a_place",
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const reelPlaceSchema = v.object({
  // 영상은 썸네일 1장이라 사진을 고를 게 없다.
  ...v.omit(placeQuerySchema, ["image_indices"]).entries,
  kind: v.pipe(
    v.picklist(PLACE_KINDS),
    v.description(
      "venue: a shop, cafe, restaurant, bar, attraction, or any business a viewer can visit. landmark: this place itself is a well-known public place such as a bridge, park, or plaza (unrelated to area_type, which describes the surrounding reference point). transit: a station, exit, or stop given as directions. media_or_brand: a TV channel, program, or brand with no specific location. private_or_not_a_place: a home, kitchen, or anything that is not a real-world place.",
    ),
  ),
  // 저장하지 않는다. 답을 근거에 묶어 두는 용도이고, 검증할 때 어느 단서를 썼는지 보인다.
  evidence: v.pipe(
    v.string(),
    v.description(
      "The exact cue this place was identified from: quote the on-screen text, signage, speech, map, or caption fragment.",
    ),
  ),
});

export type ReelPlaceQuery = v.InferOutput<typeof reelPlaceSchema>;

export const reelExtractionSchema = v.object({
  places: v.pipe(
    v.array(reelPlaceSchema),
    v.description("Every distinct real-world place featured in the reel."),
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
