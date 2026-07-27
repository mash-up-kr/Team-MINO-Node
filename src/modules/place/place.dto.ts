import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { SchemaObject } from "../../common/swagger/schema";
import { AREA_TYPES } from "../../infrastructures/geocoder/geocoder.type";

export const createPlaceRequestSchema = v.object({
  method: v.picklist(["instagram_url"]),
  data: v.object({
    url: v.pipe(v.string(), v.url(), v.regex(/instagram\.com/)),
  }),
});

export type CreatePlaceRequest = v.InferOutput<typeof createPlaceRequestSchema>;

export const createPlaceRequestApiSchema = toJsonSchema(
  createPlaceRequestSchema,
) as SchemaObject;

/*
 * job 조회/워커 경로 파라미터. uuid 검증 없이 DB에 넘기면 캐스팅 오류(22P02)가
 * 500으로 새어 나가므로 입구에서 400으로 거른다.
 */
export const jobIdSchema = v.pipe(v.string(), v.uuid());

const coordinateSchema: SchemaObject = {
  type: "object",
  properties: {
    lat: { type: "number", example: 37.5445 },
    lng: { type: "number", example: 127.0559 },
  },
};

const geoCandidateSchema: SchemaObject = {
  type: "object",
  properties: {
    provider: { type: "string", enum: ["kakao", "google"] },
    providerPlaceId: { type: "string" },
    placeName: { type: "string" },
    address: { type: "string" },
    coordinate: coordinateSchema,
    distance: { type: "number", nullable: true },
    mapUrl: { type: "string", nullable: true },
    phone: { type: "string", nullable: true },
    category: { type: "string", nullable: true },
  },
};

const extractedPlaceSchema: SchemaObject = {
  type: "object",
  properties: {
    placeName: { type: "string" },
    areaName: { type: "string" },
    areaType: { type: "string", enum: [...AREA_TYPES] },
    relation: { type: "string" },
  },
};

const placeMatchSchema: SchemaObject = {
  type: "object",
  properties: {
    extracted: extractedPlaceSchema,
    matches: {
      type: "array",
      items: geoCandidateSchema,
      description: "지오코딩 결과 후보",
    },
  },
};

export const placeMatchListResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: { type: "array", items: placeMatchSchema },
  },
};

export const errorResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "GEOCODER_ALL_FAILED" },
    message: { type: "string", example: "장소 검색이 모두 실패했습니다." },
  },
};
