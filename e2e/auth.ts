import { HttpStatus } from "@nestjs/common";
import type { TestingModuleBuilder } from "@nestjs/testing";
import { AppException } from "../src/common/exceptions/app.exception";
import { TokenVerifier } from "../src/infrastructures/auth/token-verifier";

/** 테스트 토큰 형식. 실제 Firebase 토큰을 발급할 수 없어 uid를 그대로 싣는다. */
const TEST_TOKEN_PREFIX = "test:";

/**
 * 토큰 검증기만 대역으로 바꾼다. 가드·컨트롤러·서비스는 운영과 같은 경로를
 * 그대로 타므로, 실제 Firebase 없이도 인증 분기를 검증할 수 있다.
 */
export function withFakeTokenVerifier(
  builder: TestingModuleBuilder,
): TestingModuleBuilder {
  return builder.overrideProvider(TokenVerifier).useValue({
    verify: async (token: string) => {
      if (!token.startsWith(TEST_TOKEN_PREFIX)) {
        throw new AppException(
          "UNAUTHORIZED",
          "유효하지 않은 토큰입니다.",
          HttpStatus.UNAUTHORIZED,
        );
      }
      return { uid: token.slice(TEST_TOKEN_PREFIX.length) };
    },
  });
}

/** 해당 uid로 인증된 요청 헤더. users.auth_uid 값과 맞춰 쓴다. */
export function authHeaders(uid: string): Record<string, string> {
  return { Authorization: `Bearer ${TEST_TOKEN_PREFIX}${uid}` };
}
