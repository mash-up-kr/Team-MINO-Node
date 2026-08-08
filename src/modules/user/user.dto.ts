import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { SchemaObject } from "../../common/swagger/schema";

/** 닉네임 정책: 공백 포함 한글/영문 2~15자, 특수문자 불가 (PR 리뷰 확정) */
export const nicknameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(2, "닉네임은 2자 이상이어야 합니다."),
  v.maxLength(15, "닉네임은 15자 이하여야 합니다."),
  v.regex(
    /^[가-힣A-Za-z ]+$/,
    "닉네임은 한글/영문(공백 포함)만 사용할 수 있습니다.",
  ),
);

/** 프로필 아바타. jsonb로 통째 저장하며 id 외 필드(url·color 등)는 스키마에 추가해 확장한다. */
export const avatarSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const registerUserRequestSchema = v.object({
  deviceId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
  nickname: nicknameSchema,
  avatar: v.optional(avatarSchema),
});

export type RegisterUserRequest = v.InferOutput<
  typeof registerUserRequestSchema
>;

export const updateProfileRequestSchema = v.pipe(
  v.object({
    nickname: v.optional(nicknameSchema),
    avatar: v.optional(avatarSchema),
  }),
  v.check(
    (input) => input.nickname !== undefined || input.avatar !== undefined,
    "수정할 필드가 최소 하나 필요합니다.",
  ),
);

export type UpdateProfileRequest = v.InferOutput<
  typeof updateProfileRequestSchema
>;

export const registerUserRequestApiSchema = toJsonSchema(
  registerUserRequestSchema,
  { errorMode: "ignore" },
) as SchemaObject;

export const updateProfileRequestApiSchema = toJsonSchema(
  updateProfileRequestSchema,
  { errorMode: "ignore" },
) as SchemaObject;

const userSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    nickname: { type: "string", example: "꾹이" },
    avatar: {
      type: "object",
      nullable: true,
      properties: { id: { type: "integer", example: 1 } },
    },
    createdAt: { type: "string", format: "date-time" },
  },
};

export const userResponseApiSchema: SchemaObject = {
  type: "object",
  properties: { data: userSchema },
};

export const errorResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "DEVICE_ALREADY_REGISTERED" },
    message: { type: "string" },
  },
};
