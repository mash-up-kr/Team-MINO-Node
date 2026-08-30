import * as v from "valibot";
import {
  pageQuerySchema,
  pageSizeQuerySchema,
  paginationApiSchema,
} from "../../common/pagination/pagination.dto";
import type { SchemaObject } from "../../common/swagger/schema";

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
