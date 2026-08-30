import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { NotificationRepository } from "../../../src/modules/notification/notification.repository";
import { users } from "../../../src/modules/user/user.schema";
import { authHeaders, withFakeTokenVerifier } from "../../auth";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;
let repository: NotificationRepository;
let recipientId: string;
let recipientAuthUid: string;

function api(path: string, authUid: string | null): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: authUid ? authHeaders(authUid) : {},
  });
}

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    withFakeTokenVerifier(Test.createTestingModule({ imports: [AppModule] })),
  ));
  repository = app.get(NotificationRepository);

  const db = app.get(DatabaseService).db;
  recipientAuthUid = `e2e-notif-recipient-${randomUUID()}`;
  const [recipient] = await db
    .insert(users)
    .values({
      authUid: recipientAuthUid,
      nickname: "수신자",
    })
    .returning({ id: users.id });
  if (!recipient) throw new Error("유저 픽스처 생성 실패");
  recipientId = recipient.id;
});

afterAll(async () => {
  await app.close();
});

describe("NotificationRepository.record", () => {
  it("매번 새 행으로 기록한다", async () => {
    const input = {
      recipientId,
      type: "ROOM_JOINED_SELF" as const,
      typeLabel: "방에 참가했어요",
      targetName: "우리끼리",
      url: "https://gguk.org/rooms/r1",
    };

    const first = await repository.record(input);
    const second = await repository.record(input);

    expect(first?.id).toBeDefined();
    expect(second?.id).toBeDefined();
    expect(first?.id).not.toBe(second?.id);
  });

  it("key가 같으면 두 번째부터 기록하지 않는다", async () => {
    const input = {
      recipientId,
      type: "NEARBY_PLACE" as const,
      typeLabel: "근처에 저장한 장소가 있어요",
      targetName: "패스트리 순간",
      url: "https://gguk.org/places/p1",
      key: `NEARBY_PLACE:${randomUUID()}`,
    };

    const first = await repository.record(input);
    const second = await repository.record(input);

    expect(first?.id).toBeDefined();
    expect(second).toBeNull();
  });

  it("key가 달라지면 같은 수신자여도 다시 기록한다", async () => {
    const base = {
      recipientId,
      type: "TOP_COMMENTED_PLACE" as const,
      typeLabel: "코멘트가 제일 많이 달린 장소에요",
      targetName: "어니언 성수",
      url: "https://gguk.org/places/p2",
    };

    const first = await repository.record({ ...base, key: randomUUID() });
    const second = await repository.record({ ...base, key: randomUUID() });

    expect(first?.id).toBeDefined();
    expect(second?.id).toBeDefined();
  });
});

describe("GET /api/v1/notifications", () => {
  it("최신순으로 내려주고 pageSize만큼 페이지네이션한다", async () => {
    // given
    await repository.record({
      recipientId,
      type: "SAVE_FAILED",
      typeLabel: "장소를 저장하지 못했어요.",
      targetName: "잠시 후 다시 시도해주세요",
      url: "https://gguk.org/notifications/save-error",
    });
    await repository.record({
      recipientId,
      type: "PIN_DUPLICATED",
      typeLabel: "이미 저장해둔 곳이에요",
      targetName: "패스트리 순간",
      thumbnailUrl: "https://example.com/0.jpg",
      url: "https://gguk.org/places/p1",
    });

    // when
    const response = await api(
      "/api/v1/notifications?pageSize=1",
      recipientAuthUid,
    );

    // then
    expect(response.status).toBe(200);
    const { data, pagination } = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      typeLabel: "이미 저장해둔 곳이에요",
      targetName: "패스트리 순간",
      thumbnailUrl: "https://example.com/0.jpg",
      url: "https://gguk.org/places/p1",
    });
    expect(pagination).toEqual({ page: 0, pageSize: 1, hasNext: true });
  });

  it("인증 정보가 없으면 401을 반환한다", async () => {
    // when
    const response = await api("/api/v1/notifications", null);

    // then
    expect(response.status).toBe(401);
  });
});
