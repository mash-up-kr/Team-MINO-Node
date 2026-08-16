import { applyDecorators, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiResponse } from "@nestjs/swagger";
import { CurrentUserGuard } from "../guards/current-user.guard";
import type { SchemaObject } from "../swagger/schema";

const unidentifiedErrorApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "UNIDENTIFIED_USER" },
    message: { type: "string", example: "요청 유저를 식별할 수 없습니다." },
  },
};

/**
 * 식별된 유저가 필요한 엔드포인트에 붙인다 — 가드 적용·식별 헤더 문서화·401
 * 응답 문서화를 한 세트로 묶어 개별 누락을 막는다. 인증 정책이 교체되면
 * (Firebase Auth 예정) 이 데코레이터 내부만 바뀌고 사용처는 그대로다.
 */
export const RequireCurrentUser = () =>
  applyDecorators(
    UseGuards(CurrentUserGuard),
    ApiHeader({
      name: "X-Device-Id",
      description: "요청 유저 식별용 deviceId (인증 정책 TBD — 임시 계약)",
      required: true,
    }),
    ApiResponse({
      status: 401,
      description: "요청 유저 식별 실패 (UNIDENTIFIED_USER)",
      schema: unidentifiedErrorApiSchema,
    }),
  );
