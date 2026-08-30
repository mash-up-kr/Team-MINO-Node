import * as v from "valibot";
import {
  pageQuerySchema,
  pageSizeQuerySchema,
  paginationApiSchema,
} from "../../common/pagination/pagination.dto";
import type { SchemaObject } from "../../common/swagger/schema";
import { NOTIFICATION_TYPES } from "./notification.schema";

export const listNotificationsQuerySchema = v.object({
  page: v.optional(pageQuerySchema),
  pageSize: v.optional(pageSizeQuerySchema),
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
        "탭 도착지 판별용. PIN_DUPLICATED·NEARBY_PLACE·TOP_COMMENTED_PLACE는 장소 상세, ROOM_*는 방 상세, SAVE_FAILED는 앱 내 저장 오류 안내 화면(이동 대상이 없어 url로 표현되지 않는다)",
      example: "PIN_DUPLICATED",
    },
    typeLabel: { type: "string", example: "이미 저장해둔 곳이에요" },
    targetName: { type: "string", example: "패스트리 순간" },
    thumbnailUrl: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    url: {
      type: "string",
      description:
        "서버가 완성한 유니버설 링크(잠정 — 스킴은 모바일과 협의 확정 전)",
    },
  },
};

export const notificationListResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: { type: "array", items: notificationSchema },
    pagination: paginationApiSchema,
  },
};
