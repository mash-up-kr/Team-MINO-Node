import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { withFakeTokenVerifier } from "./auth";
import { startApp } from "./start-app";

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    withFakeTokenVerifier(Test.createTestingModule({ imports: [AppModule] })),
  ));
});

afterAll(async () => {
  await app.close();
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

  it("일반 없는 경로도 404를 준다", async () => {
    const res = await fetch(`${baseUrl}/nope`);

    expect(res.status).toBe(404);
  });
});
