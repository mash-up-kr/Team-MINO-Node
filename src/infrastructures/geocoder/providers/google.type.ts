import * as v from "valibot";

const localizedTextSchema = v.object({ text: v.string() });

/*
 * Places API는 Kakao와 달리 값이 없는 필드를 빈 문자열이 아니라 아예 생략한다.
 * 결과가 0건이면 places 키 자체가 빠지므로 최상위도 optional이어야 한다.
 */
export const googleSearchTextResponseSchema = v.object({
  places: v.optional(
    v.array(
      v.object({
        id: v.string(),
        displayName: localizedTextSchema,
        formattedAddress: v.optional(v.string()),
        location: v.object({
          latitude: v.number(),
          longitude: v.number(),
        }),
        googleMapsUri: v.optional(v.string()),
        internationalPhoneNumber: v.optional(v.string()),
        primaryTypeDisplayName: v.optional(localizedTextSchema),
      }),
    ),
  ),
});

type GoogleSearchTextResponse = v.InferOutput<
  typeof googleSearchTextResponseSchema
>;
export type GooglePlaceDocument = NonNullable<
  GoogleSearchTextResponse["places"]
>[number];
