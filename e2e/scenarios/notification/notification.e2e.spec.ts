import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { and, eq } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { NotificationRepository } from "../../../src/modules/notification/notification.repository";
import { notifications } from "../../../src/modules/notification/notification.schema";
import { NotificationService } from "../../../src/modules/notification/notification.service";
import { pins } from "../../../src/modules/pin/pin.schema";
import { pinComments } from "../../../src/modules/pin/pin-comment.schema";
import { places } from "../../../src/modules/place/place.schema";
import { rooms } from "../../../src/modules/room/room.schema";
import { roomMembers } from "../../../src/modules/room/room-member.schema";
import { users } from "../../../src/modules/user/user.schema";
import { authHeaders, withFakeTokenVerifier } from "../../auth";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;
let repository: NotificationRepository;
let service: NotificationService;
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
  service = app.get(NotificationService);

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
      payload: { roomId: "r1" },
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
      payload: { placeId: "p1", pinId: "p1-pin" },
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
      payload: { placeId: "p2", pinId: "p2-pin" },
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
    });
    await repository.record({
      recipientId,
      type: "PIN_DUPLICATED",
      typeLabel: "이미 저장해둔 곳이에요",
      targetName: "패스트리 순간",
      thumbnailUrl: "https://example.com/0.jpg",
      payload: { placeId: "p1", pinId: "p1-pin" },
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
      type: "PIN_DUPLICATED",
      typeLabel: "이미 저장해둔 곳이에요",
      targetName: "패스트리 순간",
      thumbnailUrl: "https://example.com/0.jpg",
      payload: { placeId: "p1", pinId: "p1-pin" },
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

describe("NotificationRepository.findTopCommentedPlacePerUser", () => {
  it("내가 속한 방의 장소 중 코멘트가 가장 많은 곳을 하나 돌려준다", async () => {
    // given
    const db = app.get(DatabaseService).db;
    const authUid = `e2e-top-${randomUUID()}`;
    const [user] = await db
      .insert(users)
      .values({ authUid, nickname: "코멘터", fcmToken: `t-${randomUUID()}` })
      .returning({ id: users.id });
    if (!user) throw new Error("유저 픽스처 생성 실패");

    const [room] = await db
      .insert(rooms)
      .values({ ownerId: user.id, type: "shared", name: "방", color: "red" })
      .returning({ id: rooms.id });
    if (!room) throw new Error("방 픽스처 생성 실패");
    await db.insert(roomMembers).values({ roomId: room.id, userId: user.id });

    const inserted = await db
      .insert(places)
      .values(
        ["인기 장소", "한산한 장소"].map((name) => ({
          provider: "kakao" as const,
          providerPlaceId: `kakao-${randomUUID()}`,
          name,
          address: "서울",
          lat: 37.5,
          lng: 127,
        })),
      )
      .returning({ id: places.id, name: places.name });
    const popular = inserted.find((place) => place.name === "인기 장소");
    const quiet = inserted.find((place) => place.name === "한산한 장소");
    if (!popular || !quiet) throw new Error("장소 픽스처 생성 실패");

    const insertedPins = await db
      .insert(pins)
      .values([
        { roomId: room.id, placeId: popular.id },
        { roomId: room.id, placeId: quiet.id },
      ])
      .returning({ id: pins.id, placeId: pins.placeId });
    const popularPin = insertedPins.find((pin) => pin.placeId === popular.id);
    const quietPin = insertedPins.find((pin) => pin.placeId === quiet.id);
    if (!popularPin || !quietPin) throw new Error("핀 픽스처 생성 실패");

    await db.insert(pinComments).values([
      { pinId: popularPin.id, createdBy: user.id, content: "좋아요" },
      { pinId: popularPin.id, createdBy: user.id, content: "또 가고 싶다" },
      { pinId: quietPin.id, createdBy: user.id, content: "무난" },
    ]);

    // when
    const rows = await repository.findTopCommentedPlacePerUser();

    // then
    const mine = rows.filter((row) => row.userId === user.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.placeId).toBe(popular.id);
    expect(mine[0]?.pinId).toBe(popularPin.id);
    expect(mine[0]?.placeName).toBe("인기 장소");
  });

  it("코멘트가 없는 유저는 대상에서 빠진다", async () => {
    const db = app.get(DatabaseService).db;
    const authUid = `e2e-top-none-${randomUUID()}`;
    const [user] = await db
      .insert(users)
      .values({ authUid, nickname: "무코멘트" })
      .returning({ id: users.id });
    if (!user) throw new Error("유저 픽스처 생성 실패");

    const rows = await repository.findTopCommentedPlacePerUser();

    expect(rows.filter((row) => row.userId === user.id)).toHaveLength(0);
  });
});

describe("POST /api/v1/notifications/nearby-triggers", () => {
  async function seedPlace(roomId: string, name: string) {
    const db = app.get(DatabaseService).db;
    const [place] = await db
      .insert(places)
      .values({
        provider: "kakao",
        providerPlaceId: `kakao-${randomUUID()}`,
        name,
        address: "서울",
        lat: 37.5,
        lng: 127,
      })
      .returning({ id: places.id });
    if (!place) throw new Error("장소 픽스처 생성 실패");
    await db.insert(pins).values({ roomId, placeId: place.id });
    return place.id;
  }

  async function seedUserWithRoom() {
    const db = app.get(DatabaseService).db;
    const authUid = `e2e-nearby-${randomUUID()}`;
    const [user] = await db
      .insert(users)
      .values({ authUid, nickname: "근처", fcmToken: `t-${randomUUID()}` })
      .returning({ id: users.id });
    if (!user) throw new Error("유저 픽스처 생성 실패");
    const [room] = await db
      .insert(rooms)
      .values({ ownerId: user.id, type: "shared", name: "방", color: "red" })
      .returning({ id: rooms.id });
    if (!room) throw new Error("방 픽스처 생성 실패");
    await db.insert(roomMembers).values({ roomId: room.id, userId: user.id });
    return { authUid, userId: user.id, roomId: room.id };
  }

  function trigger(authUid: string, placeIds: string[]) {
    return fetch(`${baseUrl}/api/v1/notifications/nearby-triggers`, {
      method: "POST",
      headers: { ...authHeaders(authUid), "Content-Type": "application/json" },
      body: JSON.stringify({ placeIds }),
    });
  }

  it("근처 장소를 기록하고 신규 건수를 돌려준다", async () => {
    const owner = await seedUserWithRoom();
    const placeId = await seedPlace(owner.roomId, "가까운 카페");

    const response = await trigger(owner.authUid, [placeId]);

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.newPlaceCount).toBe(1);
  });

  it("이미 알린 장소는 다시 기록하지 않는다", async () => {
    const owner = await seedUserWithRoom();
    const placeId = await seedPlace(owner.roomId, "단골집");

    await trigger(owner.authUid, [placeId]);
    const second = await trigger(owner.authUid, [placeId]);

    const { data } = await second.json();
    expect(data.newPlaceCount).toBe(0);
  });

  it("접근할 수 없는 장소가 섞이면 403을 반환한다", async () => {
    const owner = await seedUserWithRoom();
    const stranger = await seedUserWithRoom();
    const mine = await seedPlace(owner.roomId, "내 장소");
    const theirs = await seedPlace(stranger.roomId, "남의 장소");

    const response = await trigger(owner.authUid, [mine, theirs]);

    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("PLACE_NOT_ACCESSIBLE");
  });

  it("인증 정보가 없으면 401을 반환한다", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/notifications/nearby-triggers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeIds: [randomUUID()] }),
      },
    );

    expect(response.status).toBe(401);
  });
});

describe("코멘트 리마인드 재발송 쿨다운", () => {
  const KST = { timeZone: "Asia/Seoul" } as const;
  const kstDate = (date: Date) =>
    date.toLocaleDateString("sv-SE", KST).slice(0, 10);

  async function seedPlaces(commentCounts: number[]) {
    const db = app.get(DatabaseService).db;
    const [user] = await db
      .insert(users)
      .values({
        authUid: `e2e-cooldown-${randomUUID()}`,
        nickname: "코멘터",
        fcmToken: `t-${randomUUID()}`,
      })
      .returning({ id: users.id });
    const [room] = await db
      .insert(rooms)
      .values({ ownerId: user?.id, type: "shared", name: "방", color: "red" })
      .returning({ id: rooms.id });
    if (!user || !room) throw new Error("픽스처 생성 실패");
    await db.insert(roomMembers).values({ roomId: room.id, userId: user.id });

    const placeIds: string[] = [];
    for (const count of commentCounts) {
      const [place] = await db
        .insert(places)
        .values({
          provider: "kakao",
          providerPlaceId: `kakao-${randomUUID()}`,
          name: `장소 ${placeIds.length}`,
          address: "서울",
          lat: 37.5,
          lng: 127,
        })
        .returning({ id: places.id });
      const [pin] = await db
        .insert(pins)
        .values({ roomId: room.id, placeId: place?.id })
        .returning({ id: pins.id });
      if (!place || !pin) throw new Error("픽스처 생성 실패");
      await db.insert(pinComments).values(
        Array.from({ length: count }, () => ({
          pinId: pin.id,
          createdBy: user.id,
          content: "코멘트",
        })),
      );
      placeIds.push(place.id);
    }
    return { userId: user.id, placeIds };
  }

  function markSent(userId: string, placeId: string, daysAgo: number) {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);
    return app
      .get(DatabaseService)
      .db.insert(notifications)
      .values({
        recipientId: userId,
        type: "TOP_COMMENTED_PLACE",
        typeLabel: "코멘트가 제일 많이 달린 장소에요",
        targetName: "장소",
        payload: { placeId, pinId: `${placeId}-pin` },
        key: `TOP_COMMENTED_PLACE:${placeId}:${kstDate(createdAt)}`,
        createdAt,
      });
  }

  async function sentOf(userId: string) {
    return app
      .get(DatabaseService)
      .db.select({ payload: notifications.payload, key: notifications.key })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, userId),
          eq(notifications.type, "TOP_COMMENTED_PLACE"),
        ),
      );
  }

  it("쿨다운 중이면 차순위 장소를 발송한다", async () => {
    const { userId, placeIds } = await seedPlaces([3, 2]);
    await markSent(userId, placeIds[0] as string, 4);

    await service.remindTopCommentedPlaces();

    const sent = await sentOf(userId);
    expect(
      sent.map((row) => (row.payload as { placeId: string }).placeId),
    ).toEqual([placeIds[0], placeIds[1]]);
  });

  it("5일이 지나면 같은 장소를 오늘 날짜 key로 다시 발송한다", async () => {
    const { userId, placeIds } = await seedPlaces([3]);
    await markSent(userId, placeIds[0] as string, 5);

    await service.remindTopCommentedPlaces();

    const sent = await sentOf(userId);
    expect(sent).toHaveLength(2);
    expect(sent.map((row) => row.key)).toContain(
      `TOP_COMMENTED_PLACE:${placeIds[0]}:${kstDate(new Date())}`,
    );
  });

  it("같은 날 다시 실행해도 한 번만 발송한다", async () => {
    const { userId } = await seedPlaces([3]);

    await service.remindTopCommentedPlaces();
    await service.remindTopCommentedPlaces();

    expect(await sentOf(userId)).toHaveLength(1);
  });
});
