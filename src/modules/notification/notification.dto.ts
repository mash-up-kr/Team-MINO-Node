import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { dateTimeSchema, uuidSchema } from "../../common/dto/common.dto";
import type { SchemaObject } from "../../common/swagger/schema";

export const notificationResponseSchema = v.object({
  id: uuidSchema,
  type: v.string(),
  payload: v.record(v.string(), v.unknown()),
  readAt: v.nullable(dateTimeSchema),
  createdAt: dateTimeSchema,
});
export type Notification = v.InferOutput<typeof notificationResponseSchema>;
export const notificationResponseApiSchema = toJsonSchema(
  notificationResponseSchema,
) as SchemaObject;

export const markNotificationsReadRequestSchema = v.object({
  notificationIds: v.optional(v.array(uuidSchema)),
  all: v.optional(v.boolean()),
});
export type MarkNotificationsReadRequest = v.InferOutput<
  typeof markNotificationsReadRequestSchema
>;
export const markNotificationsReadRequestApiSchema = toJsonSchema(
  markNotificationsReadRequestSchema,
) as SchemaObject;
