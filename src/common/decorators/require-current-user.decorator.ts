import { applyDecorators, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiResponse } from "@nestjs/swagger";
import { CurrentUserGuard } from "../guards/current-user.guard";
import type { SchemaObject } from "../swagger/schema";

const unauthorizedErrorApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: {
      type: "string",
      enum: ["UNAUTHORIZED", "TOKEN_EXPIRED", "USER_NOT_REGISTERED"],
      example: "UNAUTHORIZED",
    },
    message: { type: "string", example: "인증 정보가 없습니다." },
  },
};

/**
 * 등록된 유저가 필요한 엔드포인트에 붙인다 — 가드 적용·인증 스킴 문서화·401
 * 응답 문서화를 한 세트로 묶어 개별 누락을 막는다.
 *
 * USER_NOT_REGISTERED는 토큰은 유효하나 아직 등록 전이라는 뜻으로, 클라이언트는
 * 이를 온보딩 진입 신호로 다룬다.
 */
export const RequireCurrentUser = () =>
  applyDecorators(
    UseGuards(CurrentUserGuard),
    ApiBearerAuth(),
    ApiResponse({
      status: 401,
      description:
        "인증 실패 (UNAUTHORIZED / TOKEN_EXPIRED) 또는 미등록 유저 (USER_NOT_REGISTERED)",
      schema: unauthorizedErrorApiSchema,
    }),
  );
