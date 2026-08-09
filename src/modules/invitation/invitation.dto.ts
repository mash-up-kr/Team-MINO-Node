import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { SchemaObject } from "../../common/swagger/schema";
import {
  INVITATION_CODE_LENGTH,
  INVITATION_CODE_PATTERN,
  PREVIEW_MEMBER_LIMIT,
} from "./invitation.constant";

export const roomIdParamSchema = v.pipe(v.string(), v.uuid());

// 여기서 걸러진 값만 내려가므로 하위 계층은 형식을 다시 보지 않습니다.
export const invitationCodeParamSchema = v.pipe(
  v.string(),
  v.regex(INVITATION_CODE_PATTERN),
);

export const joinRoomRequestSchema = v.object({
  inviteCode: invitationCodeParamSchema,
});

export type JoinRoomRequest = v.InferOutput<typeof joinRoomRequestSchema>;

export const joinRoomRequestApiSchema = toJsonSchema(joinRoomRequestSchema, {
  errorMode: "ignore",
}) as SchemaObject;

export const invitationCodeResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        code: {
          type: "string",
          example: "K7Q2MZ",
          minLength: INVITATION_CODE_LENGTH,
          maxLength: INVITATION_CODE_LENGTH,
          pattern: INVITATION_CODE_PATTERN.source,
          description: `초대 링크 gguk.org/r/{code}의 code (대문자 영문 + 숫자 ${INVITATION_CODE_LENGTH}자)`,
        },
      },
    },
  },
};

export const errorResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "NOT_ROOM_MEMBER" },
    message: { type: "string", example: "방의 멤버가 아닙니다." },
  },
};

const avatarApiSchema: SchemaObject = {
  type: "object",
  nullable: true,
  properties: { id: { type: "integer", example: 3 } },
};

export const invitationPreviewResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        room: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            type: { type: "string", enum: ["personal", "shared"] },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            color: { type: "string", example: "#FF6B6B" },
            pinCount: { type: "integer", example: 999 },
            memberCount: { type: "integer", example: 7 },
            members: {
              type: "array",
              description: `겹쳐 보여줄 멤버 아바타 (최대 ${PREVIEW_MEMBER_LIMIT}명)`,
              items: {
                type: "object",
                properties: { avatar: avatarApiSchema },
              },
            },
          },
        },
        inviter: {
          type: "object",
          properties: {
            nickname: { type: "string", example: "지은" },
            avatar: avatarApiSchema,
          },
        },
      },
    },
  },
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
