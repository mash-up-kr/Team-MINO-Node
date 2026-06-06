import { BadRequestException, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AppException } from "../exceptions/app.exception";
import { HttpExceptionFilter } from "./http-exception.filter";

function createMockHost() {
  const json = vi.fn().mockReturnValue(new Response());
  const status = vi.fn();
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, json, res: undefined }),
      getRequest: () => ({ url: "/test" }),
    }),
    switchToRpc: vi.fn(),
    switchToWs: vi.fn(),
    getArgs: vi.fn(),
    getArgByIndex: vi.fn(),
    getType: () => "http" as const,
    getHandler: vi.fn(),
    getClass: vi.fn(),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe("HttpExceptionFilter", () => {
  const filter = new HttpExceptionFilter();

  it("HttpException을 errorCode + message 포맷으로 반환한다", () => {
    const { host, status, json } = createMockHost();
    filter.catch(new BadRequestException("잘못된 요청"), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      errorCode: "BAD_REQUEST",
      message: "잘못된 요청",
    });
  });

  it("AppException의 커스텀 errorCode를 사용한다", () => {
    const { host, status, json } = createMockHost();
    filter.catch(
      new AppException(
        "INVALID_INVITE_CODE",
        "만료된 초대코드입니다",
        HttpStatus.UNPROCESSABLE_ENTITY,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      errorCode: "INVALID_INVITE_CODE",
      message: "만료된 초대코드입니다",
    });
  });

  it("알 수 없는 에러는 500 INTERNAL_SERVER_ERROR로 반환한다", () => {
    const { host, status, json } = createMockHost();
    filter.catch(new Error("unexpected"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      errorCode: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  });
});
