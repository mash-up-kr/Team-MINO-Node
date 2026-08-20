import * as v from "valibot";
import type { SchemaObject } from "../../common/swagger/schema";
import {
  INVITATION_CODE_LENGTH,
  INVITATION_CODE_PATTERN,
} from "./invitation.constant";

export const roomIdParamSchema = v.pipe(v.string(), v.uuid());

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
