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
      type: "object",
      nullable: true,
      description:
        "이동 대상 식별자. 장소 대상은 placeId, 방 대상은 roomId이며 저장 오류는 null이다.",
      properties: {
        placeId: { type: "string", format: "uuid" },
        roomId: { type: "string", format: "uuid" },
      },
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
