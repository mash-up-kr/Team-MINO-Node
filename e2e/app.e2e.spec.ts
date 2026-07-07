import { afterAll, beforeAll, describe, expect, it, jest } from "bun:test";
import {
  BadRequestException,
  Controller,
  Get,
  type INestApplication,
  Module,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { ResponseInterceptor } from "../src/common/interceptors/response.interceptor";

@Controller("_sentry-e2e")
class SentryE2eController {
  @Get("server-error")
  serverError(): never {
    throw new Error("e2e unexpected failure");
  }

  @Get("bad-request")
  badRequest(): never {
    throw new BadRequestException("e2e bad request");
  }
}

@Module({ imports: [AppModule], controllers: [SentryE2eController] })
class SentryE2eModule {}

let app: INestApplication;
let baseUrl: string;
const report = jest.fn();

beforeAll(async () => {
  const adapter = new BunHonoAdapter();
  app = await NestFactory.create(SentryE2eModule, adapter, {
    bufferLogs: true,
    logger: false,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalFilters(new HttpExceptionFilter({ report }));
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(0);
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
});

describe("Bun/Hono adapter + nestjs-pino integration", () => {
  it("returns a valid HTTP Response (not a crash)", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBeGreaterThanOrEqual(100);
  });

  it("responds with healthy database status", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        status: string;
        info?: { database?: { status?: string } };
        details?: { database?: { status?: string } };
      };
    };
    expect(body.data.status).toBe("ok");
    expect(body.data.info?.database?.status).toBe("up");
    expect(body.data.details?.database?.status).toBe("up");
  });
  it("500 응답 계약을 유지하고 한 번 보고한다", async () => {
    report.mockClear();

    const response = await fetch(`${baseUrl}/_sentry-e2e/server-error`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      errorCode: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("4xx 응답 계약을 유지하고 보고하지 않는다", async () => {
    report.mockClear();

    const response = await fetch(`${baseUrl}/_sentry-e2e/bad-request`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errorCode: "BAD_REQUEST",
      message: "e2e bad request",
    });
    expect(report).not.toHaveBeenCalled();
  });
});
