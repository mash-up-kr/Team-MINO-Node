import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  avatarSchema,
  dateTimeSchema,
  nicknameSchema,
  uuidSchema,
} from "../../common/dto/common.dto";
import type { SchemaObject } from "../../common/swagger/schema";

export const placeResponseSchema = v.object({
  id: uuidSchema,
  provider: v.picklist(["kakao", "google"]),
  providerPlaceId: v.string(),
  name: v.string(),
  address: v.string(),
  city: v.nullable(v.string()),
  district: v.nullable(v.string()),
  lat: v.number(),
  lng: v.number(),
  category: v.nullable(v.string()),
  phone: v.nullable(v.string()),
  mapUrl: v.nullable(v.string()),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type Place = v.InferOutput<typeof placeResponseSchema>;
export const placeResponseApiSchema = toJsonSchema(
  placeResponseSchema,
) as SchemaObject;

export const pinResponseSchema = v.object({
  id: uuidSchema,
  roomId: uuidSchema,
  place: placeResponseSchema,
  images: v.array(v.pipe(v.string(), v.url())),
  createdBy: v.nullable(
    v.object({
      userId: uuidSchema,
      nickname: nicknameSchema,
      avatar: avatarSchema,
    }),
  ),
  createdAt: dateTimeSchema,
});
export type Pin = v.InferOutput<typeof pinResponseSchema>;
export const pinResponseApiSchema = toJsonSchema(
  pinResponseSchema,
) as SchemaObject;

export const pinDetailResponseSchema = v.object({
  ...pinResponseSchema.entries,
  sourceUrl: v.nullable(v.pipe(v.string(), v.url())),
});
export type PinDetail = v.InferOutput<typeof pinDetailResponseSchema>;
export const pinDetailResponseApiSchema = toJsonSchema(
  pinDetailResponseSchema,
) as SchemaObject;

export const commentResponseSchema = v.object({
  id: uuidSchema,
  author: v.object({
    userId: uuidSchema,
    nickname: nicknameSchema,
    avatar: avatarSchema,
  }),
  content: v.string(),
  createdAt: dateTimeSchema,
});
export type Comment = v.InferOutput<typeof commentResponseSchema>;
export const commentResponseApiSchema = toJsonSchema(
  commentResponseSchema,
) as SchemaObject;

export const cardResponseSchema = v.object({
  pin: pinResponseSchema,
});
export type Card = v.InferOutput<typeof cardResponseSchema>;
export const cardResponseApiSchema = toJsonSchema(
  cardResponseSchema,
) as SchemaObject;

export const duplicatePinRequestSchema = v.object({
  roomIds: v.pipe(v.array(uuidSchema), v.minLength(1)),
});
export type DuplicatePinRequest = v.InferOutput<
  typeof duplicatePinRequestSchema
>;
export const duplicatePinRequestApiSchema = toJsonSchema(
  duplicatePinRequestSchema,
) as SchemaObject;

export const createCommentRequestSchema = v.object({
  content: v.string(),
});
export type CreateCommentRequest = v.InferOutput<
  typeof createCommentRequestSchema
>;
export const createCommentRequestApiSchema = toJsonSchema(
  createCommentRequestSchema,
) as SchemaObject;
