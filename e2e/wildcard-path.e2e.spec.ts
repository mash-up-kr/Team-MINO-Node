import { afterAll, beforeAll, describe, expect, it, jest } from "bun:test";
import { type INestApplication, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { withFakeTokenVerifier } from "./auth";
import { startApp } from "./start-app";

let app: INestApplication;
let baseUrl: string;

const warnedEntries: unknown[] = [];

beforeAll(async () => {
  jest.spyOn(Logger.prototype, "warn").mockImplementation((entry: unknown) => {
    warnedEntries.push(entry);
  });

  ({ app, baseUrl } = await startApp(
    withFakeTokenVerifier(Test.createTestingModule({ imports: [AppModule] })),
  ));
});

afterAll(async () => {
  await app.close();
  jest.restoreAllMocks();
});

describe("와일드카드 경로(*) 요청", () => {
  it.each([
    "/%2A",
    "/*",
    "/%2a",
  ])("%s 는 500이 아니라 404를 준다", async (path) => {
    const res = await fetch(`${baseUrl}${path}`);
    const body = await res.text();

    expect(res.status).toBe(404);
    expect(body).toContain('"errorCode":"NOT_FOUND"');
  });

  it("/%2A 404를 요청 로그(warn)에도 남긴다", async () => {
    warnedEntries.length = 0;
    const res = await fetch(`${baseUrl}/%2A`);
    await res.text();

    expect(warnedEntries).toContainEqual(
      expect.objectContaining({
        method: "GET",
        path: expect.any(String),
        status: 404,
      }),
    );
  });

  it("일반 없는 경로도 404를 준다", async () => {
    const res = await fetch(`${baseUrl}/nope`);

    expect(res.status).toBe(404);
  });
});
