import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  avatarSchema,
  dateTimeSchema,
  nicknameSchema,
  uuidSchema,
} from "../../common/dto/common.dto";
import type { SchemaObject } from "../../common/swagger/schema";

export const createUserRequestSchema = v.object({
  deviceId: v.string(),
  nickname: nicknameSchema,
  avatar: v.optional(avatarSchema),
});
export type CreateUserRequest = v.InferOutput<typeof createUserRequestSchema>;
export const createUserRequestApiSchema = toJsonSchema(
  createUserRequestSchema,
) as SchemaObject;

export const updateProfileRequestSchema = v.object({
  nickname: v.optional(nicknameSchema),
  avatar: v.optional(avatarSchema),
});
export type UpdateProfileRequest = v.InferOutput<
  typeof updateProfileRequestSchema
>;
export const updateProfileRequestApiSchema = toJsonSchema(
  updateProfileRequestSchema,
) as SchemaObject;

export const pushTokenRequestSchema = v.object({
  token: v.string(),
  platform: v.optional(v.picklist(["ios", "android"])),
});
export type PushTokenRequest = v.InferOutput<typeof pushTokenRequestSchema>;
export const pushTokenRequestApiSchema = toJsonSchema(
  pushTokenRequestSchema,
) as SchemaObject;

export const userResponseSchema = v.object({
  id: uuidSchema,
  nickname: nicknameSchema,
  avatar: avatarSchema,
  createdAt: dateTimeSchema,
});
export type User = v.InferOutput<typeof userResponseSchema>;
export const userResponseApiSchema = toJsonSchema(
  userResponseSchema,
) as SchemaObject;
