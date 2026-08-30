import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from "../../common/pagination/pagination.constant";
import {
  pageQuerySchema,
  pageSizeQuerySchema,
  paginationApiSchema,
} from "../../common/pagination/pagination.dto";
import type { SchemaObject } from "../../common/swagger/schema";
import { NOTIFICATION_TYPES } from "./notification.schema";

export const listNotificationsQuerySchema = v.object({
  page: v.optional(pageQuerySchema, String(DEFAULT_PAGE)),
  pageSize: v.optional(pageSizeQuerySchema, String(DEFAULT_PAGE_SIZE)),
});

export type ListNotificationsQuery = v.InferOutput<
  typeof listNotificationsQuerySchema
>;

const notificationSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    type: {
      type: "string",
      enum: [...NOTIFICATION_TYPES],
      description:
        "탭 도착지 판별용. 장소 대상 3종은 장소 상세, ROOM_*는 방 상세, SAVE_FAILED는 앱 내 저장 오류 안내 화면으로 이동한다.",
      example: "PIN_DUPLICATED",
    },
    typeLabel: { type: "string", example: "이미 저장해둔 곳이에요" },
    targetName: { type: "string", example: "패스트리 순간" },
    thumbnailUrl: { type: "string", nullable: true },
    payload: {
      description:
        "이동 대상 식별자. 장소 대상은 placeId와 pinId, 방 대상은 roomId이며 저장 오류는 null이다. 장소 상세는 pinId로 연다.",
      oneOf: [
        {
          type: "object",
          required: ["placeId", "pinId"],
          properties: {
            placeId: { type: "string", format: "uuid" },
            pinId: { type: "string", format: "uuid" },
          },
        },
        {
          type: "object",
          required: ["roomId"],
          properties: { roomId: { type: "string", format: "uuid" } },
        },
        { type: "object", nullable: true, enum: [null] },
      ],
    },
    createdAt: { type: "string", format: "date-time" },
  },
};

export const notificationListResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: { type: "array", items: notificationSchema },
    pagination: paginationApiSchema,
  },
};

export const nearbyTriggersRequestSchema = v.object({
  placeIds: v.pipe(
    v.array(v.pipe(v.string(), v.uuid("placeId는 UUID여야 합니다."))),
    v.minLength(1, "장소가 최소 하나 필요합니다."),
    // Android 지오펜스 상한. iOS는 기기당 20개로 더 낮다.
    v.maxLength(100, "장소는 최대 100개까지 보낼 수 있습니다."),
    v.check(
      (placeIds) => new Set(placeIds).size === placeIds.length,
      "placeId가 중복되었습니다.",
    ),
  ),
});

export type NearbyTriggersRequest = v.InferOutput<
  typeof nearbyTriggersRequestSchema
>;

export const nearbyTriggersRequestApiSchema = toJsonSchema(
  nearbyTriggersRequestSchema,
  { errorMode: "ignore" },
) as SchemaObject;

export const errorResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "PLACE_NOT_ACCESSIBLE" },
    message: {
      type: "string",
      example: "접근할 수 없는 장소가 포함되어 있습니다.",
    },
  },
};

export const nearbyTriggersResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        newPlaceCount: {
          type: "integer",
          description:
            "이번 요청으로 새로 기록된(=이미 알린 적 없는) 장소 수. push 발송은 별개이며 실패해도 이 값에는 반영되지 않는다",
        },
      },
    },
  },
};
