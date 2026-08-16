import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { startApp } from "../../../e2e/start-app";
import { AppModule } from "../../app.module";

let app: INestApplication;
let baseUrl: string;

const deviceId = `e2e-user-${randomUUID()}`;

function register(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/v1/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    Test.createTestingModule({ imports: [AppModule] }),
  ));
});

afterAll(async () => {
  await app.close();
});

describe("유저 등록", () => {
  it("등록에 성공하면 프로필을 반환한다 (개인방은 응답에 미포함)", async () => {
    const response = await register({
      deviceId,
      nickname: "꾹이",
      avatar: { id: 2 },
    });

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as {
      data: Record<string, unknown>;
    };
    expect(data.nickname).toBe("꾹이");
    expect(data.avatar).toEqual({ id: 2 });
    expect(data.id).toBeString();
    expect(data).not.toContainKey("personalRoom");
  });

  it("같은 deviceId로 재등록하면 409를 반환한다", async () => {
    const response = await register({ deviceId, nickname: "다른이름" });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("DEVICE_ALREADY_REGISTERED");
  });

  it("닉네임 정책 위반은 400 VALIDATION_ERROR", async () => {
    const response = await register({
      deviceId: `e2e-user-${randomUUID()}`,
      nickname: "꾹!",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("VALIDATION_ERROR");
  });
});

describe("내 프로필", () => {
  it("X-Device-Id 헤더로 요청 유저를 식별한다", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: { "X-Device-Id": deviceId },
    });

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { nickname: string; avatar: { id: number } };
    };
    expect(data.nickname).toBe("꾹이");
    expect(data.avatar).toEqual({ id: 2 });
  });

  it("식별 헤더가 없으면 401", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`);
    expect(response.status).toBe(401);
  });

  it("미등록 deviceId면 401", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: { "X-Device-Id": `unknown-${randomUUID()}` },
    });
    expect(response.status).toBe(401);
  });

  it("닉네임과 아바타를 수정한다", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      method: "PATCH",
      headers: {
        "X-Device-Id": deviceId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nickname: "새 꾹이", avatar: { id: 4 } }),
    });

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { nickname: string; avatar: { id: number } };
    };
    expect(data.nickname).toBe("새 꾹이");
    expect(data.avatar).toEqual({ id: 4 });
  });

  it("빈 수정 요청은 400", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      method: "PATCH",
      headers: {
        "X-Device-Id": deviceId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });
});
