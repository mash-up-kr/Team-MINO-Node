import { describe, expect, it } from "bun:test";
import { readRequestHeader } from "./request-header";

describe("readRequestHeader", () => {
  it("Hono 스타일 header() 함수에서 읽는다", () => {
    const request = {
      header: (name: string) =>
        name === "authorization" ? "Bearer token-1" : undefined,
    };
    expect(readRequestHeader(request, "authorization")).toBe("Bearer token-1");
  });

  it("Headers 인스턴스에서 읽는다", () => {
    const request = {
      headers: new Headers({ authorization: "Bearer token-2" }),
    };
    expect(readRequestHeader(request, "authorization")).toBe("Bearer token-2");
  });

  it("일반 객체 헤더에서 읽는다", () => {
    const request = { headers: { authorization: "Bearer token-3" } };
    expect(readRequestHeader(request, "authorization")).toBe("Bearer token-3");
  });

  it("헤더가 없으면 undefined를 반환한다", () => {
    expect(readRequestHeader({}, "authorization")).toBeUndefined();
    expect(readRequestHeader({ headers: {} }, "authorization")).toBeUndefined();
  });
});
