import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { AppModule } from "../src/app.module";
import { LoggingInterceptor } from "../src/common/interceptors/logging.interceptor";

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const adapter = new BunHonoAdapter();
  app = await NestFactory.create(AppModule, adapter, {
    bufferLogs: true,
    logger: false,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalInterceptors(new LoggingInterceptor());

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
      status: string;
      info?: { database?: { status?: string } };
      details?: { database?: { status?: string } };
    };
    expect(body.status).toBe("ok");
    expect(body.info?.database?.status).toBe("up");
    expect(body.details?.database?.status).toBe("up");
  });
});
