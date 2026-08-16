import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  pageQuerySchema,
  pageSizeQuerySchema,
  paginationApiSchema,
} from "../../common/pagination/pagination.dto";
import type { SchemaObject } from "../../common/swagger/schema";
import { isInstagramUrl } from "../../infrastructures/scraper/instagram.util";

export const uuidParamSchema = v.pipe(v.string(), v.uuid());

const instagramUrlSchema = v.pipe(
  v.string(),
  v.url(),
  v.check(
    (value: string) => isInstagramUrl(value),
    "지원하지 않는 인스타그램 URL입니다.",
  ),
);

export const createRoomPinRequestSchema = v.object({
  url: instagramUrlSchema,
});

export type CreateRoomPinRequest = v.InferOutput<
  typeof createRoomPinRequestSchema
>;

export const pinExtractionTaskSchema = v.object({
  roomId: uuidParamSchema,
  sourceId: uuidParamSchema,
  createdBy: uuidParamSchema,
  url: instagramUrlSchema,
});

export type PinExtractionTask = v.InferOutput<typeof pinExtractionTaskSchema>;

/**
 * page/pageSize 둘 다 미지정이면 전체를 반환한다(지도 전체 보기 보장 — PR 리뷰 확정).
 * 하나라도 지정되면 offset 기반 페이지네이션한다.
 */
export const listPinsQuerySchema = v.object({
  roomId: uuidParamSchema,
  page: v.optional(pageQuerySchema),
  pageSize: v.optional(pageSizeQuerySchema),
});

export type ListPinsQuery = v.InferOutput<typeof listPinsQuerySchema>;

export const duplicatePinRequestSchema = v.object({
  roomIds: v.pipe(
    v.array(uuidParamSchema),
    v.minLength(1, "복제 대상 방이 최소 하나 필요합니다."),
  ),
});

export type DuplicatePinRequest = v.InferOutput<
  typeof duplicatePinRequestSchema
>;

export const duplicatePinRequestApiSchema = toJsonSchema(
  duplicatePinRequestSchema,
  { errorMode: "ignore" },
) as SchemaObject;

export const createRoomPinRequestApiSchema = toJsonSchema(
  createRoomPinRequestSchema,
  { errorMode: "ignore" },
) as SchemaObject;

const placeSchema: SchemaObject = {
  type: "object",
  description: "places 컬럼 전체 (images 제외 — 핀 응답으로 이동)",
  properties: {
    id: { type: "string", format: "uuid" },
    provider: { type: "string", enum: ["kakao", "google"] },
    providerPlaceId: { type: "string" },
    name: { type: "string" },
    address: { type: "string" },
    city: { type: "string", nullable: true },
    district: { type: "string", nullable: true },
    lat: { type: "number" },
    lng: { type: "number" },
    category: { type: "string", nullable: true },
    phone: { type: "string", nullable: true },
    mapUrl: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const pinSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    roomId: { type: "string", format: "uuid" },
    place: placeSchema,
    images: {
      type: "array",
      items: { type: "string" },
      description: "게시물 이미지 (places.images — pins 이동 전 임시 매핑)",
    },
    createdBy: {
      type: "object",
      nullable: true,
      description: '핀을 저장한 멤버 프로필 ("누가 추가한 곳" 표시용)',
      properties: {
        userId: { type: "string", format: "uuid" },
        nickname: { type: "string" },
        avatar: {
          type: "object",
          nullable: true,
          properties: { id: { type: "integer" } },
        },
      },
    },
    createdAt: { type: "string", format: "date-time" },
  },
};

export const pinListResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: { type: "array", items: pinSchema },
    pagination: {
      ...paginationApiSchema,
      nullable: true,
      description: "전체 조회(page/pageSize 미지정) 시 생략",
    },
  },
};

export const pinDetailResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        ...pinSchema.properties,
        sourceUrl: {
          type: "string",
          nullable: true,
          description: "출처 링크 (sources.original_url, 단일)",
        },
      },
    },
  },
};

export const okResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: { ok: { type: "boolean", example: true } },
    },
  },
};

export const errorResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "DUPLICATE_PIN_IN_ROOM" },
    message: { type: "string" },
  },
};
