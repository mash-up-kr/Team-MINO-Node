import * as v from "valibot";
import { AREA_TYPES } from "../../infrastructures/geocoder/geocoder.type";

export const createPlaceRequestSchema = v.object({
  method: v.picklist(["instagram_url"]),
  data: v.object({
    url: v.pipe(v.string(), v.url(), v.regex(/instagram\.com/)),
  }),
});

export type CreatePlaceRequest = v.InferOutput<typeof createPlaceRequestSchema>;

// TODO: KakaoProvider 확인용 임시 의존성으로 전체 플로우 연동 후 제거합니다.
export const testGeocodeRequestSchema = v.object({
  placeName: v.pipe(v.string(), v.minLength(1)),
  areaName: v.pipe(v.string(), v.minLength(1)),
  areaType: v.optional(v.picklist(AREA_TYPES)),
});

// TODO: KakaoProvider 확인용 임시 의존성으로 전체 플로우 연동 후 제거합니다.
export type TestGeocodeRequest = v.InferOutput<typeof testGeocodeRequestSchema>;

// job 조회/워커 경로 파라미터. uuid 검증 없이 DB에 넘기면 캐스팅 오류(22P02)가
// 500으로 새어 나가므로 입구에서 400으로 거른다.
export const jobIdSchema = v.pipe(v.string(), v.uuid());
