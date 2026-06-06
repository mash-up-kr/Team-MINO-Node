import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { AppModule } from "../src/app.module";

// Provide required env vars for module validation (no real DB needed for adapter tests)
process.env.DATABASE_URL ??= "postgresql://localhost/test";

let app: INestApplication;
let baseUrl: string;
const requestLogs: Array<{ method: string; path: string; status: number }> = [];

beforeAll(async () => {
  const adapter = new BunHonoAdapter();
  app = await NestFactory.create(AppModule, adapter, {
    bufferLogs: true,
    logger: false,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  adapter.useRequestLogger(({ method, path, status, durationMs }) => {
    requestLogs.push({ method, path, status });
    logger.log(`${method} ${path} ${status} ${durationMs}ms`);
  });

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

  it("responds with proper status code, not an unhandled error", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect([200, 404, 503]).toContain(res.status);
  });

  it("records request logs via adapter hook", async () => {
    requestLogs.length = 0;
    await fetch(`${baseUrl}/`);
    expect(requestLogs).toHaveLength(1);
    expect(requestLogs[0].method).toBe("GET");
    expect(requestLogs[0].path).toBe("/");
    expect(requestLogs[0].status).toBeGreaterThanOrEqual(100);
  });
});
