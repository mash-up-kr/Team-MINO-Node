import { describe, expect, it, jest } from "bun:test";
import { Logger } from "@nestjs/common";
import { LoggingMiddleware } from "./logging.middleware";

function createReqRes(method = "GET", path = "/test", status?: number) {
  return {
    req: { method, path },
    res: { res: status === undefined ? undefined : { status } },
  };
}

describe("LoggingMiddleware", () => {
  const middleware = new LoggingMiddleware();
  const logSpy = jest
    .spyOn(Logger.prototype, "log")
    .mockImplementation(() => {});

  it("응답 완료 후 실제 status를 읽어 로그를 남긴다 (201)", async () => {
    // given
    logSpy.mockClear();
    const { req, res } = createReqRes("POST", "/items", 201);
    const next = jest.fn(async () => {});

    // when
    await middleware.use(req, res, next);

    // then
    expect(next).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/items",
        status: 201,
        durationMs: expect.any(Number),
      }),
    );
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
    logSpy.mockClear();
    const { req, res } = createReqRes("GET", "/boom", 500);
    const error = new Error("downstream failed");

    // when
    const act = middleware.use(req, res, async () => {
      throw error;
    });

    // then
    await expect(act).rejects.toThrow("downstream failed");
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/boom", status: 500 }),
    );
  });
});
