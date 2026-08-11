import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  avatarSchema,
  dateTimeSchema,
  nicknameSchema,
  uuidSchema,
} from "../../common/dto/common.dto";
import type { SchemaObject } from "../../common/swagger/schema";

export const createRoomRequestSchema = v.object({
  name: v.pipe(v.string(), v.maxLength(15)),
  description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(20)))),
  color: v.string(),
});
export type CreateRoomRequest = v.InferOutput<typeof createRoomRequestSchema>;
export const createRoomRequestApiSchema = toJsonSchema(
  createRoomRequestSchema,
) as SchemaObject;

export const updateRoomRequestSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.maxLength(15))),
  description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(20)))),
  color: v.optional(v.string()),
});
export type UpdateRoomRequest = v.InferOutput<typeof updateRoomRequestSchema>;
export const updateRoomRequestApiSchema = toJsonSchema(
  updateRoomRequestSchema,
) as SchemaObject;

export const transferOwnerRequestSchema = v.object({
  nextOwnerId: uuidSchema,
});
export type TransferOwnerRequest = v.InferOutput<
  typeof transferOwnerRequestSchema
>;
export const transferOwnerRequestApiSchema = toJsonSchema(
  transferOwnerRequestSchema,
) as SchemaObject;

export const joinRoomRequestSchema = v.object({
  inviteCode: v.pipe(v.string(), v.maxLength(16)),
});
export type JoinRoomRequest = v.InferOutput<typeof joinRoomRequestSchema>;
export const joinRoomRequestApiSchema = toJsonSchema(
  joinRoomRequestSchema,
) as SchemaObject;

export const createPinByLinkRequestSchema = v.object({
  url: v.pipe(v.string(), v.url()),
});
export type CreatePinByLinkRequest = v.InferOutput<
  typeof createPinByLinkRequestSchema
>;
export const createPinByLinkRequestApiSchema = toJsonSchema(
  createPinByLinkRequestSchema,
) as SchemaObject;

export const roomResponseSchema = v.object({
  id: uuidSchema,
  type: v.picklist(["personal", "shared"]),
  name: v.pipe(v.string(), v.maxLength(15)),
  description: v.nullable(v.pipe(v.string(), v.maxLength(20))),
  color: v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/)),
  ownerId: uuidSchema,
  createdAt: dateTimeSchema,
});
export type Room = v.InferOutput<typeof roomResponseSchema>;
export const roomResponseApiSchema = toJsonSchema(
  roomResponseSchema,
) as SchemaObject;

export const roomMemberResponseSchema = v.object({
  userId: uuidSchema,
  nickname: nicknameSchema,
  avatar: avatarSchema,
  isOwner: v.boolean(),
  joinedAt: dateTimeSchema,
});
export type RoomMember = v.InferOutput<typeof roomMemberResponseSchema>;
export const roomMemberResponseApiSchema = toJsonSchema(
  roomMemberResponseSchema,
) as SchemaObject;

export const roomSummaryResponseSchema = v.object({
  ...roomResponseSchema.entries,
  pinCount: v.number(),
  memberCount: v.number(),
  hasPlace: v.nullable(v.boolean()),
  users: v.nullable(v.array(roomMemberResponseSchema)),
});
export type RoomSummary = v.InferOutput<typeof roomSummaryResponseSchema>;
export const roomSummaryResponseApiSchema = toJsonSchema(
  roomSummaryResponseSchema,
) as SchemaObject;

export const roomDetailResponseSchema = v.object({
  ...roomResponseSchema.entries,
  pinCount: v.number(),
  memberCount: v.number(),
});
export type RoomDetail = v.InferOutput<typeof roomDetailResponseSchema>;
export const roomDetailResponseApiSchema = toJsonSchema(
  roomDetailResponseSchema,
) as SchemaObject;

export const invitationPreviewResponseSchema = v.object({
  roomId: uuidSchema,
  name: v.pipe(v.string(), v.maxLength(15)),
  description: v.nullable(v.pipe(v.string(), v.maxLength(20))),
  color: v.object({ id: v.number() }),
  pinCount: v.number(),
  inviter: v.object({ nickname: nicknameSchema }),
});
export type InvitationPreview = v.InferOutput<
  typeof invitationPreviewResponseSchema
>;
export const invitationPreviewResponseApiSchema = toJsonSchema(
  invitationPreviewResponseSchema,
) as SchemaObject;
