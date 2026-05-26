import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HttpExceptionFilter } from "./http-exception.filter";

function createMockHost(url = "/test") {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url }),
    }),
    status,
    json,
  };
}

describe("HttpExceptionFilter", () => {
  const filter = new HttpExceptionFilter();

  it("HttpException을 올바른 포맷으로 반환한다", () => {
    const host = createMockHost();
    filter.catch(new BadRequestException("잘못된 요청"), host as any);

    expect(host.status).toHaveBeenCalledWith(400);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: "잘못된 요청",
        path: "/test",
      }),
    );
  });

  it("알 수 없는 에러는 500으로 반환한다", () => {
    const host = createMockHost();
    filter.catch(new Error("unexpected"), host as any);

    expect(host.status).toHaveBeenCalledWith(500);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: "Internal server error",
        path: "/test",
      }),
    );
  });

  it("message 배열을 그대로 반환한다", () => {
    const host = createMockHost();
    filter.catch(
      new HttpException({ message: ["field is required"], error: "Bad Request" }, HttpStatus.BAD_REQUEST),
      host as any,
    );

    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: ["field is required"],
        error: "Bad Request",
      }),
    );
  });
});
