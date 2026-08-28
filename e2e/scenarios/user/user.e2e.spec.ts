import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { users } from "../../../src/modules/user/user.schema";
import { authHeaders, withFakeTokenVerifier } from "../../auth";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;
let db: DatabaseService["db"];

// 시나리오 파일끼리 DB를 공유하므로 인증 식별자를 매 실행 고유하게 만듭니다.
const authUid = `e2e-user-${randomUUID()}`;

function register(uid: string | null, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/v1/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(uid ? authHeaders(uid) : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    withFakeTokenVerifier(Test.createTestingModule({ imports: [AppModule] })),
  ));
  db = app.get(DatabaseService).db;
});

afterAll(async () => {
  await app.close();
});

describe("유저 등록", () => {
  it("등록에 성공하면 프로필을 반환한다 (개인방은 응답에 미포함)", async () => {
    const response = await register(authUid, {
      nickname: "꾹이",
      avatar: { color: "red" },
    });

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as {
      data: Record<string, unknown>;
    };
    expect(data.nickname).toBe("꾹이");
    expect(data.avatar).toEqual({ color: "red" });
    expect(data.id).toBeString();
    expect(data).not.toContainKey("personalRoom");
  });

  it("같은 계정으로 재등록하면 409를 반환한다", async () => {
    const response = await register(authUid, {
      nickname: "다른이름",
      avatar: { color: "blue" },
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("USER_ALREADY_REGISTERED");
  });

  it("인증 정보가 없으면 401을 반환한다", async () => {
    const response = await register(null, {
      nickname: "꾹이",
      avatar: { color: "blue" },
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("UNAUTHORIZED");
  });

  it("닉네임 정책 위반은 400 VALIDATION_ERROR", async () => {
    const response = await register(`e2e-user-${randomUUID()}`, {
      nickname: "꾹!",
      avatar: { color: "blue" },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("VALIDATION_ERROR");
  });

  it("avatar 없이 등록하면 400 VALIDATION_ERROR (최초 진입 시 필수 입력)", async () => {
    const response = await register(`e2e-user-${randomUUID()}`, {
      nickname: "꾹이",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("VALIDATION_ERROR");
  });
});

describe("내 프로필", () => {
  it("Bearer 토큰으로 요청 유저를 식별한다", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: authHeaders(authUid),
    });

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { nickname: string; avatar: { color: string } };
    };
    expect(data.nickname).toBe("꾹이");
    expect(data.avatar).toEqual({ color: "red" });
  });

  it("인증 정보가 없으면 401", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`);

    expect(response.status).toBe(401);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("UNAUTHORIZED");
  });

  it("토큰은 유효하나 등록 전이면 401 USER_NOT_REGISTERED", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: authHeaders(`unknown-${randomUUID()}`),
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("USER_NOT_REGISTERED");
  });

  it("닉네임과 아바타를 수정한다", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      method: "PATCH",
      headers: {
        ...authHeaders(authUid),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nickname: "새꾹이",
        avatar: { color: "purple" },
      }),
    });

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { nickname: string; avatar: { color: string } };
    };
    expect(data.nickname).toBe("새꾹이");
    expect(data.avatar).toEqual({ color: "purple" });
  });

  it("빈 수정 요청은 400", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      method: "PATCH",
      headers: {
        ...authHeaders(authUid),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });
});

describe("PUT /users/me/push-token", () => {
  it("토큰을 등록한다", async () => {
    const uid = `e2e-user-push-a-${randomUUID()}`;
    const registered = await register(uid, {
      nickname: "에이",
      avatar: { color: "red" },
    });
    const { data } = (await registered.json()) as { data: { id: string } };

    const response = await fetch(`${baseUrl}/api/v1/users/me/push-token`, {
      method: "PUT",
      headers: { ...authHeaders(uid), "Content-Type": "application/json" },
      body: JSON.stringify({ token: "token-a" }),
    });

    expect(response.status).toBe(200);
    const [row] = await db
      .select({ fcmToken: users.fcmToken })
      .from(users)
      .where(eq(users.id, data.id));
    expect(row?.fcmToken).toBe("token-a");
  });

  it("재설치로 같은 토큰을 다른 유저가 등록하면 이전 유저의 토큰을 회수한다", async () => {
    const uidA = `e2e-user-push-b1-${randomUUID()}`;
    const uidB = `e2e-user-push-b2-${randomUUID()}`;
    const registeredA = await register(uidA, {
      nickname: "비원",
      avatar: { color: "red" },
    });
    const { data: userA } = (await registeredA.json()) as {
      data: { id: string };
    };
    const registeredB = await register(uidB, {
      nickname: "비투",
      avatar: { color: "red" },
    });
    const { data: userB } = (await registeredB.json()) as {
      data: { id: string };
    };
    await fetch(`${baseUrl}/api/v1/users/me/push-token`, {
      method: "PUT",
      headers: { ...authHeaders(uidA), "Content-Type": "application/json" },
      body: JSON.stringify({ token: "token-b" }),
    });

    const response = await fetch(`${baseUrl}/api/v1/users/me/push-token`, {
      method: "PUT",
      headers: { ...authHeaders(uidB), "Content-Type": "application/json" },
      body: JSON.stringify({ token: "token-b" }),
    });

    expect(response.status).toBe(200);
    const [rowA] = await db
      .select({ fcmToken: users.fcmToken })
      .from(users)
      .where(eq(users.id, userA.id));
    const [rowB] = await db
      .select({ fcmToken: users.fcmToken })
      .from(users)
      .where(eq(users.id, userB.id));
    expect(rowA?.fcmToken).toBeNull();
    expect(rowB?.fcmToken).toBe("token-b");
  });

  it("인증 정보가 없으면 401을 반환한다", async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me/push-token`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "token-c" }),
    });

    expect(response.status).toBe(401);
  });
});
