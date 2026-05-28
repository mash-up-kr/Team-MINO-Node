import { BadRequestException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AppException } from "../exceptions/app.exception";
import { HttpExceptionFilter } from "./http-exception.filter";

function createMockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: "/test" }),
    }),
    status,
    json,
  };
}

describe("HttpExceptionFilter", () => {
  const filter = new HttpExceptionFilter();

  it("HttpException을 errorCode + message 포맷으로 반환한다", () => {
    const host = createMockHost();
    filter.catch(new BadRequestException("잘못된 요청"), host as any);

    expect(host.status).toHaveBeenCalledWith(400);
    expect(host.json).toHaveBeenCalledWith({
      errorCode: "BAD_REQUEST",
      message: "잘못된 요청",
    });
  });

  it("AppException의 커스텀 errorCode를 사용한다", () => {
    const host = createMockHost();
    filter.catch(
      new AppException("INVALID_INVITE_CODE", "만료된 초대코드입니다", HttpStatus.UNPROCESSABLE_ENTITY),
      host as any,
    );

    expect(host.status).toHaveBeenCalledWith(422);
    expect(host.json).toHaveBeenCalledWith({
      errorCode: "INVALID_INVITE_CODE",
      message: "만료된 초대코드입니다",
    });
  });

  it("알 수 없는 에러는 500 INTERNAL_SERVER_ERROR로 반환한다", () => {
    const host = createMockHost();
    filter.catch(new Error("unexpected"), host as any);

    expect(host.status).toHaveBeenCalledWith(500);
    expect(host.json).toHaveBeenCalledWith({
      errorCode: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  });
});
