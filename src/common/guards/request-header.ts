/**
 * 플랫폼(Hono)·테스트 환경에 따라 요청 객체의 헤더 접근 방식이 달라
 * 가능한 형태를 순서대로 시도한다.
 */
export function readRequestHeader(
  request: unknown,
  name: string,
): string | undefined {
  const req = request as {
    header?: (name: string) => string | undefined;
    headers?: Headers | Record<string, string | undefined>;
  };

  if (typeof req.header === "function") {
    return req.header(name) ?? undefined;
  }
  if (req.headers instanceof Headers) {
    return req.headers.get(name) ?? undefined;
  }
  return req.headers?.[name];
}
