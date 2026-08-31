import { describe, expect, it, jest } from "bun:test";
import { Logger } from "@nestjs/common";
import { RequestContext } from "../context/request-context";
import { LoggingMiddleware, REQUEST_ID_HEADER } from "./logging.middleware";

function createReqRes(
  method = "GET",
  path = "/test",
  status?: number,
  headers?: Record<string, string>,
) {
  const responseHeaders: Record<string, string> = {};
  return {
    req: { method, path, headers },
    res: {
      res: status === undefined ? undefined : { status },
      header: (name: string, value: string) => {
        responseHeaders[name] = value;
      },
    },
    responseHeaders,
  };
}

describe("LoggingMiddleware", () => {
  const middleware = new LoggingMiddleware();
  const logSpy = jest
    .spyOn(Logger.prototype, "log")
    .mockImplementation(() => {});
  const warnSpy = jest
    .spyOn(Logger.prototype, "warn")
    .mockImplementation(() => {});
  const errorSpy = jest
    .spyOn(Logger.prototype, "error")
    .mockImplementation(() => {});

  it("응답 완료 후 2xx는 logger.log로 남긴다 (201)", async () => {
    // given
    logSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
    const { req, res, responseHeaders } = createReqRes("POST", "/items", 201, {
      "x-request-id": "custom-req-id",
    });
    let capturedRequestIdInNext: string | undefined;
    const next = jest.fn(async () => {
      capturedRequestIdInNext = RequestContext.getRequestId();
    });

    // when
    await middleware.use(req, res, next);

    // then
    expect(next).toHaveBeenCalledTimes(1);
    expect(capturedRequestIdInNext).toBe("custom-req-id");
    expect(responseHeaders[REQUEST_ID_HEADER]).toBe("custom-req-id");
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "custom-req-id",
        method: "POST",
        path: "/items",
        status: 201,
        durationMs: expect.any(Number),
      }),
    );
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("4xx 클라이언트 오류는 logger.warn으로 남긴다", async () => {
    // given
    logSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
    const { req, res } = createReqRes("GET", "/items/999", 404);

    // when
    await middleware.use(req, res, async () => {});

    // then
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/items/999",
        status: 404,
        requestId: expect.any(String),
      }),
    );
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("5xx 서버 오류는 logger.error로 남긴다", async () => {
    // given
    logSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
    const { req, res } = createReqRes("GET", "/server-error", 500);

    // when
    await middleware.use(req, res, async () => {});

    // then
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/server-error",
        status: 500,
        requestId: expect.any(String),
      }),
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("status가 없으면 200으로 폴백한다", async () => {
    // given
    logSpy.mockClear();
    const { req, res } = createReqRes("GET", "/unknown");

    // when
    await middleware.use(req, res, async () => {});

    // then
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200 }),
    );
  });

  it("next()가 throw해도 finally에서 로그를 남기고 에러를 전파한다", async () => {
    // given
    errorSpy.mockClear();
    const { req, res } = createReqRes("GET", "/boom", 500);
    const error = new Error("downstream failed");

    // when
    const act = middleware.use(req, res, async () => {
      throw error;
    });

    // then
    await expect(act).rejects.toThrow("downstream failed");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/boom", status: 500 }),
    );
  });
});
