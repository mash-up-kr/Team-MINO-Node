import * as v from "valibot";

export const kakaoKeywordSearchResponseSchema = v.object({
  documents: v.array(
    v.object({
      id: v.string(),
      place_name: v.string(),
      category_name: v.string(),
      phone: v.string(),
      address_name: v.string(),
      road_address_name: v.string(),
      x: v.string(),
      y: v.string(),
      place_url: v.string(),
      distance: v.optional(v.string()),
    }),
  ),
});

type KakaoKeywordSearchResponse = v.InferOutput<
  typeof kakaoKeywordSearchResponseSchema
>;
export type KakaoKeywordDocument =
  KakaoKeywordSearchResponse["documents"][number];
