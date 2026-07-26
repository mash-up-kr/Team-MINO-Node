import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "bun:test";
import {
  BadRequestException,
  Controller,
  Get,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { SentryErrorReporter } from "../../src/infrastructures/sentry/sentry-reporter";
import { startApp } from "../start-app";

@Controller("_e2e")
class ErrorController {
  @Get("server-error")
  serverError(): never {
    throw new Error("e2e unexpected failure");
  }

  @Get("bad-request")
  badRequest(): never {
    throw new BadRequestException("e2e bad request");
  }
}

const reporter = { report: jest.fn() };
let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    Test.createTestingModule({
      imports: [AppModule],
      controllers: [ErrorController],
    })
      .overrideProvider(SentryErrorReporter)
      .useValue(reporter),
  ));
});

beforeEach(() => {
  reporter.report.mockClear();
});

afterAll(async () => {
  await app.close();
});

describe("공통 HTTP 오류 계약", () => {
  it("예상하지 못한 오류는 500으로 응답하고 한 번 보고한다", async () => {
    const response = await fetch(`${baseUrl}/_e2e/server-error`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      errorCode: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
    expect(reporter.report).toHaveBeenCalledTimes(1);
  });

  it("4xx 오류는 보고하지 않는다", async () => {
    const response = await fetch(`${baseUrl}/_e2e/bad-request`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errorCode: "BAD_REQUEST",
      message: "e2e bad request",
    });
    expect(reporter.report).not.toHaveBeenCalled();
  });
});
