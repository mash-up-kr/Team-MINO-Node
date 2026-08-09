/** PostgreSQL unique_violation 에러 코드. */
const UNIQUE_VIOLATION = "23505";

/**
 * 활성 유니크 인덱스 위반 여부. 사전 조회로 거른 뒤에도 동시 요청이
 * 인덱스에 막힐 수 있어, 그 경우를 도메인 에러(409)로 변환할 때 쓴다.
 * drizzle이 드라이버 에러를 DrizzleQueryError로 감싸므로 cause 체인을 따라가며 확인한다.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== "object" || current === null) {
      return false;
    }
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
