import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { count, eq } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { pins } from "../../../src/modules/pin/pin.schema";
import { pinAccesses } from "../../../src/modules/pin/pin-access.schema";
import { places } from "../../../src/modules/place/place.schema";
import { rooms } from "../../../src/modules/room/room.schema";
import { roomMembers } from "../../../src/modules/room/room-member.schema";
import { sources } from "../../../src/modules/source/source.schema";
import { users } from "../../../src/modules/user/user.schema";
import { authHeaders, withFakeTokenVerifier } from "../../auth";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;
let db: DatabaseService["db"];

const memberAuthUid = `e2e-pin-member-${randomUUID()}`;
const outsiderAuthUid = `e2e-pin-outsider-${randomUUID()}`;
let memberId: string;
let roomAId: string;
let roomBId: string;
let outsiderRoomId: string;
let firstPinId: string;
let placeIds: string[] = [];
const sourceUrl = `https://www.instagram.com/p/e2e-${randomUUID()}/`;

function api(
  path: string,
  authUid: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(authUid),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    withFakeTokenVerifier(Test.createTestingModule({ imports: [AppModule] })),
  ));
  db = app.get(DatabaseService).db;

  // 핀 생성(링크 분석)·방 합류 API는 별도 소관이라 전부 시드로 구성한다
  const seededUsers = await db
    .insert(users)
    .values([
      { authUid: memberAuthUid, nickname: "핀러버" },
      { authUid: outsiderAuthUid, nickname: "외부인" },
    ])
    .returning({ id: users.id });
  memberId = seededUsers[0]?.id as string;
  const outsiderId = seededUsers[1]?.id as string;

  const seededRooms = await db
    .insert(rooms)
    .values(
      [
        { ownerId: memberId, name: "핀 방 A" },
        { ownerId: memberId, name: "핀 방 B" },
        { ownerId: outsiderId, name: "남의 방" },
      ].map((room) => ({
        ...room,
        type: "shared" as const,
        color: "black",
      })),
    )
    .returning({ id: rooms.id });
  roomAId = seededRooms[0]?.id as string;
  roomBId = seededRooms[1]?.id as string;
  outsiderRoomId = seededRooms[2]?.id as string;

  await db.insert(roomMembers).values([
    { roomId: roomAId, userId: memberId },
    { roomId: roomBId, userId: memberId },
    { roomId: outsiderRoomId, userId: outsiderId },
  ]);

  const seededPlaces = await db
    .insert(places)
    .values(
      [0, 1, 2].map((n) => ({
        provider: "kakao" as const,
        providerPlaceId: `e2e-place-${randomUUID()}`,
        name: `장소 ${n}`,
        address: "서울 성동구 상원4길 10",
        lat: 37.5445 + n * 0.001,
        lng: 127.0559,
        externalUrl: "https://place.map.kakao.com/123",
        images: [`https://img.example.com/${n}.jpg`],
      })),
    )
    .returning({ id: places.id });
  placeIds = seededPlaces.map((p) => p.id);

  const [source] = await db
    .insert(sources)
    .values({ type: "instagram", originalUrl: sourceUrl })
    .returning({ id: sources.id });

  const seededPins = await db
    .insert(pins)
    .values(
      placeIds.map((placeId, index) => ({
        roomId: roomAId,
        placeId,
        sourceId: index === 0 ? (source?.id as string) : null,
        createdBy: memberId,
      })),
    )
    .returning({ id: pins.id });
  firstPinId = seededPins[0]?.id as string;
});

afterAll(async () => {
  await app.close();
});

describe("핀 목록 조회", () => {
  it("page/pageSize 미지정 시 전체를 반환하고 pagination이 없다", async () => {
    const response = await api(`/api/v1/pins?roomId=${roomAId}`, memberAuthUid);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<Record<string, unknown>>;
      pagination?: unknown;
    };
    expect(body.data).toHaveLength(3);
    expect(body.pagination).toBeUndefined();

    const pin = body.data.find((p) => p.id === firstPinId) as Record<
      string,
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 응답 검사
      any
    >;
    expect(pin.place.mapUrl).toBe("https://place.map.kakao.com/123");
    expect(pin.place).not.toContainKey("images");
    expect(pin.images).toHaveLength(1);
    expect(pin.createdBy.userId).toBe(memberId);
    expect(pin.createdBy.nickname).toBe("핀러버");
  });

  it("페이지네이션을 지정하면 pagination 메타가 함께 온다", async () => {
    const first = await api(
      `/api/v1/pins?roomId=${roomAId}&page=0&pageSize=2`,
      memberAuthUid,
    );
    const firstBody = (await first.json()) as {
      data: unknown[];
      pagination: { page: number; pageSize: number; hasNext: boolean };
    };
    expect(firstBody.data).toHaveLength(2);
    expect(firstBody.pagination).toEqual({
      page: 0,
      pageSize: 2,
      hasNext: true,
    });

    const second = await api(
      `/api/v1/pins?roomId=${roomAId}&page=1&pageSize=2`,
      memberAuthUid,
    );
    const secondBody = (await second.json()) as {
      data: unknown[];
      pagination: { hasNext: boolean };
    };
    expect(secondBody.data).toHaveLength(1);
    expect(secondBody.pagination.hasNext).toBe(false);
  });

  it("방 멤버가 아니면 403", async () => {
    const response = await api(
      `/api/v1/pins?roomId=${roomAId}`,
      outsiderAuthUid,
    );
    expect(response.status).toBe(403);
  });
});

describe("핀 상세 조회", () => {
  it("장소 전체 정보와 출처 링크를 반환한다", async () => {
    const response = await api(`/api/v1/pins/${firstPinId}`, memberAuthUid);

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 응답 검사
      data: Record<string, any>;
    };
    expect(data.sourceUrl).toBe(sourceUrl);
    expect(data.place.provider).toBe("kakao");
    expect(data.place.address).toBe("서울 성동구 상원4길 10");
  });

  it("없는 핀은 404", async () => {
    const response = await api(`/api/v1/pins/${randomUUID()}`, memberAuthUid);
    expect(response.status).toBe(404);
  });

  it("핀이 속한 방의 멤버가 아니면 403", async () => {
    const response = await api(`/api/v1/pins/${firstPinId}`, outsiderAuthUid);
    expect(response.status).toBe(403);
  });
});

describe("다른 방에 핀 복제", () => {
  it("대상 방을 11개 선택해도 대상 방 조회까지 진행한다", async () => {
    const response = await api(
      `/api/v1/pins/${firstPinId}/duplicate`,
      memberAuthUid,
      {
        method: "POST",
        body: JSON.stringify({
          roomIds: Array.from({ length: 11 }, randomUUID),
        }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("대상 방에 핀이 복제된다", async () => {
    const response = await api(
      `/api/v1/pins/${firstPinId}/duplicate`,
      memberAuthUid,
      { method: "POST", body: JSON.stringify({ roomIds: [roomBId] }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { ok: true } });

    const list = await api(`/api/v1/pins?roomId=${roomBId}`, memberAuthUid);
    const body = (await list.json()) as {
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 응답 검사
      data: Array<Record<string, any>>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.place.id).toBe(placeIds[0]);
  });

  it("대상 방 중 하나라도 같은 장소가 있으면 409로 전체 거절한다", async () => {
    const response = await api(
      `/api/v1/pins/${firstPinId}/duplicate`,
      memberAuthUid,
      { method: "POST", body: JSON.stringify({ roomIds: [roomBId] }) },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("DUPLICATE_PIN_IN_ROOM");
  });

  it("멤버가 아닌 방으로의 복제는 403", async () => {
    const response = await api(
      `/api/v1/pins/${firstPinId}/duplicate`,
      memberAuthUid,
      { method: "POST", body: JSON.stringify({ roomIds: [outsiderRoomId] }) },
    );
    expect(response.status).toBe(403);
  });
});

describe("핀 접근 기록", () => {
  it("접근마다 행이 추가된다 (append-only)", async () => {
    for (let i = 0; i < 2; i++) {
      const response = await api(
        `/api/v1/pins/${firstPinId}/accesses`,
        memberAuthUid,
        { method: "POST" },
      );
      expect(response.status).toBe(200);
    }

    const [row] = await db
      .select({ value: count() })
      .from(pinAccesses)
      .where(eq(pinAccesses.pinId, firstPinId));
    expect(row?.value).toBe(2);
  });
});
