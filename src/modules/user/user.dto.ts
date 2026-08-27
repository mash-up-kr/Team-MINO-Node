import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { COLOR_KEYS } from "../../common/colors/color.constant";
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

/** 프로필 아바타. jsonb로 통째 저장하며 color 외 필드는 스키마에 추가해 확장한다. */
export const avatarSchema = v.object({
  // 방 색상과 같은 13색 팔레트 키 — 실제 색 매핑은 클라이언트 담당
  color: v.picklist(COLOR_KEYS, "색상은 팔레트 키 중 하나여야 합니다."),
});

export const registerUserRequestSchema = v.object({
  nickname: nicknameSchema,
  // 닉네임·프로필 이미지는 최초 진입 시 1회 필수 입력(PRD) — 등록에서 avatar 필수
  avatar: avatarSchema,
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
      properties: {
        color: { type: "string", enum: [...COLOR_KEYS], example: "red" },
      },
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
    errorCode: { type: "string", example: "USER_ALREADY_REGISTERED" },
    message: { type: "string" },
  },
};
