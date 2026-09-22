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

/**
 * Wrapped in an object so structured output uses the provider-friendly object mode.
 *
 * 장소가 "몇 번 사진"을 고르게 하는 대신, 이미지 한 장당 객체 하나를 순서대로 받는다.
 * 장소 쪽에서 인덱스를 고르게 하면 캡션이 "1. … 2. …"처럼 번호를 매긴 글에서 통째로
 * 한 칸 밀린 답이 돌아왔다(장소마다 바로 다음 사진이 붙었다).
 *
 * 각 객체는 자기 이미지의 라벨 번호(image_index)와 사진에 찍힌 글자(visible_text)를
 * 함께 들고 온다. 번호를 스스로 적게 해 두면 어긋났을 때 서버가 그 칸만 걸러낼 수 있고,
 * 상호를 옮겨 적게 해 두면 캡션 순서가 아니라 사진에 보이는 것을 근거로 고르게 된다.
 */
export function createPlaceExtractionSchema(imageCount: number) {
  return v.object({
    places: v.pipe(
      v.array(placeQuerySchema),
      v.description("Every distinct real-world place featured in the post."),
    ),
    image_places: v.pipe(
      v.array(
        v.object({
          image_index: v.pipe(
            v.number(),
            v.description(
              'The N from the "[image N]" label printed directly above this image.',
            ),
          ),
          visible_text: v.pipe(
            v.string(),
            v.description(
              "The place name or signage text printed on this image, transcribed verbatim. Empty string when the image has no such text.",
            ),
          ),
          place_name: v.pipe(
            v.string(),
            v.description(
              "Which place from the places array this image shows, copied verbatim. Empty string when the image shows no specific place (cover, outro, promo).",
            ),
          ),
        }),
      ),
      v.description(
        `One object per provided image, in the order the images were given (${imageCount} objects).`,
      ),
    ),
  });
}

export type PlaceExtractionResult = v.InferOutput<
  ReturnType<typeof createPlaceExtractionSchema>
>;

/** 이미지 한 장에 대한 모델의 판단. */
export type ImagePlace = PlaceExtractionResult["image_places"][number];

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
