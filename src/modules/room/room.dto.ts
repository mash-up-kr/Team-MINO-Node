import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { COLOR_KEYS } from "../../common/colors/color.constant";
import type { SchemaObject } from "../../common/swagger/schema";

export const uuidParamSchema = v.pipe(v.string(), v.uuid());

/** 방 이름 정책: 최소 제한 없음·최대 15자·중복 허용·앞뒤 공백 제거 (PR 리뷰 확정) */
const roomNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "방 이름을 입력해 주세요."),
  v.maxLength(15, "방 이름은 15자 이하여야 합니다."),
);

/** 방 설명: 20자 이내 (PR 리뷰 확정) */
const roomDescriptionSchema = v.nullable(
  v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(20, "방 설명은 20자 이하여야 합니다."),
  ),
);

/** 색상은 확정 팔레트 키(13색)만 허용한다. 실제 색 매핑은 클라이언트 담당. */
const roomColorSchema = v.picklist(
  COLOR_KEYS,
  "색상은 팔레트 키 중 하나여야 합니다.",
);

export const createRoomRequestSchema = v.object({
  name: roomNameSchema,
  description: v.optional(roomDescriptionSchema),
  color: roomColorSchema,
});

export type CreateRoomRequest = v.InferOutput<typeof createRoomRequestSchema>;

export const updateRoomRequestSchema = v.pipe(
  v.object({
    name: v.optional(roomNameSchema),
    description: v.optional(roomDescriptionSchema),
    color: v.optional(roomColorSchema),
  }),
  v.check(
    (input) =>
      input.name !== undefined ||
      input.description !== undefined ||
      input.color !== undefined,
    "수정할 필드가 최소 하나 필요합니다.",
  ),
);

export type UpdateRoomRequest = v.InferOutput<typeof updateRoomRequestSchema>;

export const transferOwnerRequestSchema = v.object({
  nextOwnerId: uuidParamSchema,
});

export type TransferOwnerRequest = v.InferOutput<
  typeof transferOwnerRequestSchema
>;

/** 쿼리 파라미터는 문자열로 들어오므로 boolean은 "true"/"false"를 변환한다. */
export const listRoomsQuerySchema = v.object({
  showHasPlaceId: v.optional(uuidParamSchema),
  showUsers: v.optional(
    v.pipe(
      v.picklist(["true", "false"]),
      v.transform((value) => value === "true"),
    ),
  ),
});

export type ListRoomsQuery = v.InferOutput<typeof listRoomsQuerySchema>;

export const createRoomRequestApiSchema = toJsonSchema(
  createRoomRequestSchema,
  { errorMode: "ignore" },
) as SchemaObject;

export const updateRoomRequestApiSchema = toJsonSchema(
  updateRoomRequestSchema,
  { errorMode: "ignore" },
) as SchemaObject;

export const transferOwnerRequestApiSchema = toJsonSchema(
  transferOwnerRequestSchema,
  { errorMode: "ignore" },
) as SchemaObject;

const roomSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    type: { type: "string", enum: ["personal", "shared"] },
    name: { type: "string", example: "맛집 탐방" },
    description: { type: "string", nullable: true },
    color: {
      type: "string",
      enum: [...COLOR_KEYS],
      example: "red",
      description:
        "팔레트 색상 키(13색, kebab-case). 실제 색 매핑은 클라이언트 담당, 개인방 기본은 grey.",
    },
    ownerId: { type: "string", format: "uuid" },
    createdAt: { type: "string", format: "date-time" },
  },
};

const roomMemberSchema: SchemaObject = {
  type: "object",
  properties: {
    userId: { type: "string", format: "uuid" },
    nickname: { type: "string" },
    avatar: {
      type: "object",
      nullable: true,
      properties: { color: { type: "string", example: "red" } },
    },
    isOwner: { type: "boolean" },
    joinedAt: { type: "string", format: "date-time" },
  },
};

const roomSummarySchema: SchemaObject = {
  type: "object",
  properties: {
    ...roomSchema.properties,
    pinCount: { type: "integer" },
    memberCount: { type: "integer" },
    thumbnailList: {
      type: "array",
      items: { type: "string" },
      description:
        "최근 핀 최대 4개의 장소 대표 이미지 URL(최신순). 저장된 핀이 없으면 방장 아바타 색상 키 1개.",
    },
    hasPlace: {
      type: "boolean",
      nullable: true,
      description: "?showHasPlaceId= 지정 시에만 포함",
    },
    users: {
      type: "array",
      nullable: true,
      description: "?showUsers=true 지정 시에만 포함",
      items: roomMemberSchema,
    },
  },
};

export const roomResponseApiSchema: SchemaObject = {
  type: "object",
  properties: { data: roomSchema },
};

export const roomListResponseApiSchema: SchemaObject = {
  type: "object",
  properties: { data: { type: "array", items: roomSummarySchema } },
};

export const roomDetailResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        ...roomSchema.properties,
        pinCount: { type: "integer" },
        memberCount: { type: "integer" },
      },
    },
  },
};

export const roomMemberListResponseApiSchema: SchemaObject = {
  type: "object",
  properties: { data: { type: "array", items: roomMemberSchema } },
};

export const okResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: { ok: { type: "boolean", example: true } },
    },
  },
};

export const errorResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "OWNER_TRANSFER_REQUIRED" },
    message: { type: "string" },
  },
};
