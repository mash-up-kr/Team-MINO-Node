import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  pageQuerySchema,
  pageSizeQuerySchema,
  paginationApiSchema,
} from "../../common/pagination/pagination.dto";
import type { SchemaObject } from "../../common/swagger/schema";

export const uuidParamSchema = v.pipe(v.string(), v.uuid());

/**
 * url은 형식만 본다. 인스타그램 게시물 링크인지는 PinService가 판정하고,
 * 아니면 400 대신 202 + 저장 실패 알림으로 알린다(클라이언트 확정).
 */
export const createRoomPinsRequestSchema = v.object({
  url: v.pipe(v.string(), v.minLength(1, "링크가 비어 있습니다.")),
  roomIds: v.pipe(
    v.array(uuidParamSchema),
    v.minLength(1, "저장할 방이 최소 하나 필요합니다."),
    v.check(
      (roomIds) => new Set(roomIds).size === roomIds.length,
      "중복된 방을 선택할 수 없습니다.",
    ),
  ),
});

export type CreateRoomPinsRequest = v.InferOutput<
  typeof createRoomPinsRequestSchema
>;

export const PIN_SORT_OPTIONS = [
  "all",
  "ggukPick",
  "latest",
  "distance",
  "commented",
] as const;

export type PinSortOption = (typeof PIN_SORT_OPTIONS)[number];

/**
 * 카테고리 필터를 걸지 않음(전체)을 뜻하는 값. places.category_group의 값이 아니라
 * 조회 조건에서만 의미를 갖는 센티널이라 이름을 붙여 둔다.
 */
export const PIN_CATEGORY_ALL = "all";

export const PIN_CATEGORY_OPTIONS = [
  PIN_CATEGORY_ALL,
  "cafe",
  "restaurant",
] as const;

export type PinCategoryOption = (typeof PIN_CATEGORY_OPTIONS)[number];

/** 쿼리 파라미터는 문자열로 들어오므로 숫자 변환을 포함한다. */
const coordinateSchema = (min: number, max: number, label: string) =>
  v.pipe(
    v.string(),
    v.regex(/^-?\d+(\.\d+)?$/, `${label}는 숫자여야 합니다.`),
    v.transform(Number),
    v.minValue(min),
    v.maxValue(max),
    v.description("sort=distance일 때 필수"),
  );

/**
 * page/pageSize 둘 다 미지정이면 전체를 반환한다(지도 전체 보기 보장 — PR 리뷰 확정).
 * 하나라도 지정되면 offset 기반 페이지네이션한다.
 * sort 기본값은 all, category 기본값은 all. distance는 lat·lng 좌표가 필수다.
 */
export const listPinsQuerySchema = v.pipe(
  v.object({
    roomId: v.optional(
      v.pipe(
        uuidParamSchema,
        v.description("방 UUID. 생략하면 내가 속한 모든 활성 방을 조회."),
      ),
    ),
    sort: v.optional(
      v.pipe(
        v.picklist(PIN_SORT_OPTIONS),
        v.description("기본값은 all. distance는 lat·lng가 필요."),
      ),
      "all",
    ),
    category: v.optional(
      v.pipe(
        v.picklist(PIN_CATEGORY_OPTIONS),
        v.description("기본값은 all (전체)."),
      ),
      PIN_CATEGORY_ALL,
    ),
    lat: v.optional(coordinateSchema(-90, 90, "lat")),
    lng: v.optional(coordinateSchema(-180, 180, "lng")),
    page: v.optional(pageQuerySchema),
    pageSize: v.optional(pageSizeQuerySchema),
  }),
  v.check(
    (query) =>
      query.sort !== "distance" ||
      (query.lat !== undefined && query.lng !== undefined),
    "sort=distance는 lat·lng가 필요합니다.",
  ),
);

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

export const createRoomPinsRequestApiSchema = toJsonSchema(
  createRoomPinsRequestSchema,
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
      description: "이 핀이 만들어진 게시물의 이미지 (pins.images)",
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
          properties: { color: { type: "string", example: "red" } },
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
