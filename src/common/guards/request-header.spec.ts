import { describe, expect, it } from "bun:test";
import { readRequestHeader } from "./request-header";

describe("readRequestHeader", () => {
  it("Hono 스타일 header() 함수에서 읽는다", () => {
    const request = {
      header: (name: string) =>
        name === "x-device-id" ? "device-1" : undefined,
    };
    expect(readRequestHeader(request, "x-device-id")).toBe("device-1");
  });

  it("Headers 인스턴스에서 읽는다", () => {
    const request = { headers: new Headers({ "x-device-id": "d2" }) };
    expect(readRequestHeader(request, "x-device-id")).toBe("d2");
  });

  it("일반 객체 헤더에서 읽는다", () => {
    const request = { headers: { "x-device-id": "d3" } };
    expect(readRequestHeader(request, "x-device-id")).toBe("d3");
  });

  it("헤더가 없으면 undefined를 반환한다", () => {
    expect(readRequestHeader({}, "x-device-id")).toBeUndefined();
    expect(readRequestHeader({ headers: {} }, "x-device-id")).toBeUndefined();
  });
});
