import { describe, expect, it, jest } from "bun:test";
import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { AppException } from "../exceptions/app.exception";
import { HttpExceptionFilter } from "./http-exception.filter";

function createMockHost() {
  const json = jest.fn().mockReturnValue(new Response());
  const status = jest.fn();
  const host = new ExecutionContextHost([
    { url: "/test" },
    { status, json, res: undefined },
  ]);
  host.setType("http");

  return { host, status, json };
}

describe("HttpExceptionFilter", () => {
  const report = jest.fn();
  const filter = new HttpExceptionFilter({ report });

  it("HttpException을 errorCode + message 포맷으로 반환한다", () => {
    report.mockClear();
    const { host, status, json } = createMockHost();
    filter.catch(new BadRequestException("잘못된 요청"), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      errorCode: "BAD_REQUEST",
      message: "잘못된 요청",
    });
    expect(report).not.toHaveBeenCalled();
  });

  it("AppException의 커스텀 errorCode를 사용한다", () => {
    report.mockClear();
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
    expect(report).not.toHaveBeenCalled();
  });

  it("알 수 없는 에러는 500 INTERNAL_SERVER_ERROR로 반환한다", () => {
    report.mockClear();
    const error = new Error("unexpected");
    const { host, status, json } = createMockHost();
    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      errorCode: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
    expect(report).toHaveBeenCalledWith(error, {
      errorCode: "INTERNAL_SERVER_ERROR",
      httpStatusCode: 500,
    });
  });

  it("500 HttpException을 한 번 수집한다", () => {
    report.mockClear();
    const error = new HttpException("secret detail", 500);
    const { host } = createMockHost();

    filter.catch(error, host);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(error, {
      errorCode: "INTERNAL_SERVER_ERROR",
      httpStatusCode: 500,
    });
  });

  it("500 AppException을 한 번 수집한다", () => {
    report.mockClear();
    const error = new AppException("DATABASE_FAILURE", "secret detail", 500);
    const { host } = createMockHost();

    filter.catch(error, host);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(error, {
      errorCode: "DATABASE_FAILURE",
      httpStatusCode: 500,
    });
  });

  it("Error가 아닌 값도 원문 없이 수집한다", () => {
    report.mockClear();
    const { host } = createMockHost();

    filter.catch("user@example.com", host);

    const captured = report.mock.calls[0]?.[0];
    expect(captured).toBeInstanceOf(Error);
    expect(captured.message).toBe("Non-Error exception");
  });
});
