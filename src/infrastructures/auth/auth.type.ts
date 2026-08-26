/** 검증된 ID 토큰에서 뽑아낸 인증 주체. */
export type VerifiedToken = {
  /**
   * IdP가 부여한 안정적인 사용자 식별자(Firebase uid).
   * `users.auth_uid`와 1:1로 대응하며, 익명 계정에 소셜 계정을 연결해도 유지된다.
   */
  uid: string;
};
