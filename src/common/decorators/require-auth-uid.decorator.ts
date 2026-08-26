import { applyDecorators, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiResponse } from "@nestjs/swagger";
import { AuthUidGuard } from "../guards/auth-uid.guard";
import type { SchemaObject } from "../swagger/schema";

/** 토큰 검증 단계에서 나올 수 있는 실패. 등록 여부는 보지 않는다. */
export const tokenErrorApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: {
      type: "string",
      enum: ["UNAUTHORIZED", "TOKEN_EXPIRED"],
      example: "UNAUTHORIZED",
    },
    message: { type: "string", example: "인증 정보가 없습니다." },
  },
};

/**
 * 유효한 토큰만 필요한 엔드포인트에 붙인다 — 가드 적용·인증 스킴 문서화·401
 * 응답 문서화를 한 세트로 묶는다.
 *
 * 아직 users 행이 없는 유저 등록 흐름을 위한 것이며, 등록된 유저까지 필요한
 * 엔드포인트는 RequireCurrentUser()를 쓴다.
 */
export const RequireAuthUid = () =>
  applyDecorators(
    UseGuards(AuthUidGuard),
    ApiBearerAuth(),
    ApiResponse({
      status: 401,
      description: "인증 실패 (UNAUTHORIZED / TOKEN_EXPIRED)",
      schema: tokenErrorApiSchema,
    }),
  );
