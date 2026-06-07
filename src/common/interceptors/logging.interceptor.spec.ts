import { describe, expect, it, jest } from "bun:test";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { LoggingInterceptor } from "./logging.interceptor";

function createMockContext(
  method = "GET",
  path = "/test",
  responseStatus?: number,
) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, path }),
      getResponse: () => ({
        res: responseStatus ? { status: responseStatus } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function createCallHandler(observable: ReturnType<typeof of>) {
  return { handle: () => observable } as CallHandler;
}

describe("LoggingInterceptor", () => {
  const interceptor = new LoggingInterceptor();
  const logSpy = jest
    .spyOn(Logger.prototype, "log")
    .mockImplementation(() => {});

  it("성공 응답 시 method, path, status, durationMs를 객체로 로그를 남긴다", async () => {
    // given
    logSpy.mockClear();
    const ctx = createMockContext("GET", "/health", 200);
    const handler = createCallHandler(of<never>({} as never));

    // when
    await lastValueFrom(interceptor.intercept(ctx, handler));

    // then
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/health",
        status: 200,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("에러 응답 시 err.status를 status로 로그를 남긴다", async () => {
    // given
    logSpy.mockClear();
    const error = Object.assign(new Error("not found"), { status: 404 });
    const ctx = createMockContext("GET", "/health");
    const handler = createCallHandler(throwError(() => error));

    // when
    await lastValueFrom(interceptor.intercept(ctx, handler)).catch(() => {});

    // then
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
    );
  });

  it("status가 없는 에러는 500으로 로그를 남긴다", async () => {
    // given
    logSpy.mockClear();
    const ctx = createMockContext("POST", "/test");
    const handler = createCallHandler(
      throwError(() => new Error("unexpected")),
    );

    // when
    await lastValueFrom(interceptor.intercept(ctx, handler)).catch(() => {});

    // then
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", path: "/test", status: 500 }),
    );
  });
});
