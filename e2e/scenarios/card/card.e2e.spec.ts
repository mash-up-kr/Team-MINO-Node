import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { pins } from "../../../src/modules/pin/pin.schema";
import { pinAccesses } from "../../../src/modules/pin/pin-access.schema";
import { pinComments } from "../../../src/modules/pin/pin-comment.schema";
import { places } from "../../../src/modules/place/place.schema";
import { rooms } from "../../../src/modules/room/room.schema";
import { roomMembers } from "../../../src/modules/room/room-member.schema";
import { users } from "../../../src/modules/user/user.schema";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;
let db: DatabaseService["db"];

// 시나리오 파일끼리 DB를 공유하므로 기기 식별자를 매 실행 고유하게 만듭니다.
const memberDeviceId = `e2e-card-member-${randomUUID()}`;
const otherDeviceId = `e2e-card-other-${randomUUID()}`;
const outsiderDeviceId = `e2e-card-outsider-${randomUUID()}`;

let memberId: string;
let otherId: string;
let roomId: string;
let freshRoomId: string;
let mirrorRoomId: string;
/** 저장일 오름차순 핀 id. seedPins가 채운다. */
const pinIds: string[] = [];

/** 서울 시청. nearby 테스트의 원점. */
const ORIGIN = { lat: 37.5665, lng: 126.978 };
const DAY = 86_400_000;

function api(path: string, deviceId: string) {
  return fetch(`${baseUrl}${path}`, { headers: { "X-Device-Id": deviceId } });
}

async function cards(path: string, deviceId = memberDeviceId) {
  const response = await api(path, deviceId);
  return { status: response.status, body: await response.json() };
}

async function seedPlaces(count: number, nearOrigin: number) {
  return await db
    .insert(places)
    .values(
      Array.from({ length: count }, (_, index) => ({
        provider: "kakao" as const,
        providerPlaceId: `kakao-card-${randomUUID()}`,
        name: `장소 ${index}`,
        address: `서울 어딘가 ${index}`,
        // 앞의 nearOrigin개만 원점 근처, 나머지는 부산으로 멀리 둔다.
        lat: index < nearOrigin ? ORIGIN.lat : 35.1796,
        lng: index < nearOrigin ? ORIGIN.lng : 129.0756,
      })),
    )
    .returning({ id: places.id });
}

/**
 * 기본 방에 핀 12개를 저장일 오름차순으로 심는다.
 * - 0번: 요청 유저가 열어봄 → 묵힘이 갱신돼 후보에서 뒤로 밀린다
 * - 5번: 코멘트 2건          → 이야기 많은 곳
 * - 6번: 다른 유저가 열어봄   → 친구들이 많이 본 곳
 * - 7번: 다른 방에도 저장     → 여럿이 저장한 곳
 * 가장 묵힌 4장(1~4번)은 가볼 만한 곳이 먼저 가져가므로 지표는 5번 뒤에 둔다.
 * 좌표는 0·1번만 원점 근처다.
 */
async function seedPins() {
  const insertedPlaces = await seedPlaces(12, 2);
  const base = Date.UTC(2026, 0, 1);

  const inserted = await db
    .insert(pins)
    .values(
      insertedPlaces.map((place, index) => ({
        roomId,
        placeId: place.id,
        createdBy: memberId,
        // 하루 간격으로 벌려 저장일 순서를 결정적으로 만든다.
        createdAt: new Date(base + index * DAY),
      })),
    )
    .returning({ id: pins.id });
  pinIds.push(...inserted.map((pin) => pin.id));

  await db.insert(pinComments).values([
    { pinId: pinIds[5], createdBy: memberId, content: "여기 좋아요" },
    { pinId: pinIds[5], createdBy: memberId, content: "재방문 의사 있음" },
  ]);
  // 같은 장소를 다른 방에도 저장하면 "여럿이 저장한 곳"이 된다.
  await db
    .insert(pins)
    .values({ roomId: mirrorRoomId, placeId: insertedPlaces[7].id });
  await db.insert(pinAccesses).values([
    // 요청 유저 본인의 열람 → 묵힘 갱신
    { pinId: pinIds[0], userId: memberId },
    // 다른 유저의 열람 → 클릭수만 오르고 요청 유저의 묵힘에는 영향 없음
    { pinId: pinIds[6], userId: otherId },
  ]);
}

/** 지표가 하나도 없고 저장일이 최근인 방. 신규 방 상태를 재현한다. */
async function seedFreshRoom() {
  const insertedPlaces = await seedPlaces(3, 0);
  await db.insert(pins).values(
    insertedPlaces.map((place, index) => ({
      roomId: freshRoomId,
      placeId: place.id,
      createdBy: memberId,
      createdAt: new Date(Date.now() - (index + 1) * DAY),
    })),
  );
}

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    Test.createTestingModule({ imports: [AppModule] }),
  ));
  db = app.get(DatabaseService).db;

  const insertedUsers = await db
    .insert(users)
    .values([
      { deviceId: memberDeviceId, nickname: "민호", avatar: { id: 1 } },
      { deviceId: otherDeviceId, nickname: "재성" },
      { deviceId: outsiderDeviceId, nickname: "외부인" },
    ])
    .returning({ id: users.id, deviceId: users.deviceId });
  const idOf = (deviceId: string) =>
    insertedUsers.find((user) => user.deviceId === deviceId)?.id as string;
  memberId = idOf(memberDeviceId);
  otherId = idOf(otherDeviceId);

  const insertedRooms = await db
    .insert(rooms)
    .values([
      { ownerId: memberId, type: "shared", name: "카드방", color: "black" },
      { ownerId: memberId, type: "shared", name: "신규방", color: "black" },
      { ownerId: memberId, type: "shared", name: "복제방", color: "black" },
    ])
    .returning({ id: rooms.id });
  [roomId, freshRoomId, mirrorRoomId] = insertedRooms.map((room) => room.id);

  await db.insert(roomMembers).values([
    { roomId, userId: memberId },
    { roomId: freshRoomId, userId: memberId },
  ]);

  await seedPins();
  await seedFreshRoom();
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/v1/rooms/:roomId/cards", () => {
  it("방 멤버가 아니면 403을 반환한다", async () => {
    const { status, body } = await cards(
      `/api/v1/rooms/${roomId}/cards`,
      outsiderDeviceId,
    );

    expect(status).toBe(403);
    expect(body.errorCode).toBe("NOT_ROOM_MEMBER");
  });

  it("식별 헤더가 없으면 401을 반환한다", async () => {
    const response = await fetch(`${baseUrl}/api/v1/rooms/${roomId}/cards`);

    expect(response.status).toBe(401);
  });

  it("sort=nearby인데 좌표가 없으면 400을 반환한다", async () => {
    const { status, body } = await cards(
      `/api/v1/rooms/${roomId}/cards?sort=nearby`,
    );

    expect(status).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_ERROR");
  });

  it("기본 정렬은 묵힌 순이고 최대 10장을 준다", async () => {
    const { status, body } = await cards(`/api/v1/rooms/${roomId}/cards`);

    expect(status).toBe(200);
    expect(body.data).toHaveLength(10);
    // 열어본 0번은 묵힘이 갱신돼 상위 10에서 밀려난다.
    const ids = body.data.map((card: { id: string }) => card.id);
    expect(ids).not.toContain(pinIds[0]);
    expect(ids).toEqual(pinIds.slice(1, 11));
  });

  it("지표를 가진 핀에 해당 라벨을 붙인다", async () => {
    const { body } = await cards(`/api/v1/rooms/${roomId}/cards`);
    const byId = new Map<string, string>(
      body.data.map((card: { id: string; labelGroup: string }) => [
        card.id,
        card.labelGroup,
      ]),
    );

    expect(byId.get(pinIds[5])).toBe("manyComments");
    expect(byId.get(pinIds[6])).toBe("manyViews");
    expect(byId.get(pinIds[7])).toBe("manySaves");
  });

  it("가장 묵힌 4장은 가볼 만한 곳이 가져간다", async () => {
    const { body } = await cards(`/api/v1/rooms/${roomId}/cards`);
    const worth = body.data
      .filter(
        (card: { labelGroup: string }) => card.labelGroup === "worthVisiting",
      )
      .map((card: { id: string }) => card.id);

    // 0번이 밀려났으므로 1~4번이 가장 묵힌 4장이다.
    expect(worth.slice(0, 4)).toEqual(pinIds.slice(1, 5));
  });

  it("지표가 없는 신규 방은 전부 가볼 만한 곳이다", async () => {
    const { status, body } = await cards(`/api/v1/rooms/${freshRoomId}/cards`);

    expect(status).toBe(200);
    expect(body.data).toHaveLength(3);
    const labels = body.data.map(
      (card: { labelGroup: string }) => card.labelGroup,
    );
    expect(new Set(labels)).toEqual(new Set(["worthVisiting"]));
  });

  it("sort=latest는 최근 14일 이내 저장분만 담는다", async () => {
    // 기본 방 시드는 2026-01-01부터라 전부 14일 밖이다.
    const { status, body } = await cards(
      `/api/v1/rooms/${roomId}/cards?sort=latest`,
    );

    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("sort=latest는 최신 저장분을 앞에 둔다", async () => {
    const { body } = await cards(
      `/api/v1/rooms/${freshRoomId}/cards?sort=latest`,
    );

    const times = body.data.map((card: { createdAt: string }) =>
      new Date(card.createdAt).getTime(),
    );
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("sort=nearby는 반경 3km 밖 장소를 제외한다", async () => {
    const { status, body } = await cards(
      `/api/v1/rooms/${roomId}/cards?sort=nearby&lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`,
    );

    expect(status).toBe(200);
    const ids = body.data.map((card: { id: string }) => card.id);
    // 원점 근처는 0·1번뿐이고 나머지는 부산이라 걸러진다.
    expect(ids.sort()).toEqual([pinIds[0], pinIds[1]].sort());
  });
});
