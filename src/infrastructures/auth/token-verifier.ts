import type { VerifiedToken } from "./auth.type";

/**
 * ID 토큰을 검증해 인증 주체를 돌려준다.
 *
 * 구현 교체(Firebase → 자체 발급 등)와 테스트 대역 주입을 위해 추상 클래스를
 * DI 토큰으로 쓴다. 검증 실패는 구현체가 AppException(401)으로 변환한다.
 */
export abstract class TokenVerifier {
  abstract verify(token: string): Promise<VerifiedToken>;
}
