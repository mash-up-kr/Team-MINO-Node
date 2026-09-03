import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { count, eq, inArray } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { pins } from "../../../src/modules/pin/pin.schema";
import { pinAccesses } from "../../../src/modules/pin/pin-access.schema";
import { pinComments } from "../../../src/modules/pin/pin-comment.schema";
import { places } from "../../../src/modules/place/place.schema";
import { classifyPlaceCategory } from "../../../src/modules/place/place.util";
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
let secondPinId: string;
let thirdPinId: string;
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
        color: "gray",
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

  const placeDefs = [
    {
      name: "장소 0 (카페)",
      category: "음식점 > 카페 > 디저트카페",
      lat: 37.5445,
      lng: 127.0559,
    },
    {
      name: "장소 1 (식당)",
      category: "음식점 > 한식 > 고기구이",
      lat: 37.5545,
      lng: 127.0559,
    },
    {
      name: "장소 2 (기타)",
      category: "가정,생활 > 문구,사무용품",
      lat: 37.5645,
      lng: 127.0559,
    },
  ];

  const seededPlaces = await db
    .insert(places)
    .values(
      placeDefs.map((def, n) => ({
        provider: "kakao" as const,
        providerPlaceId: `e2e-place-${randomUUID()}`,
        name: def.name,
        category: def.category,
        // 운영에서는 place upsert가 채우는 값이라 픽스처도 같은 분류기를 쓴다.
        categoryGroup: classifyPlaceCategory(def.category),
        address: "서울 성동구 상원4길 10",
        lat: def.lat,
        lng: def.lng,
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

  const now = Date.now();
  const seededPins = await db
    .insert(pins)
    .values(
      placeIds.map((placeId, index) => ({
        roomId: roomAId,
        placeId,
        sourceId: index === 0 ? (source?.id as string) : null,
        createdBy: memberId,
        // Pin 0: 3일 전, Pin 1: 2일 전, Pin 2: 1일 전
        createdAt: new Date(now - (3 - index) * 86_400_000),
      })),
    )
    .returning({ id: pins.id });
  firstPinId = seededPins[0]?.id as string;
  secondPinId = seededPins[1]?.id as string;
  thirdPinId = seededPins[2]?.id as string;

  // Pin 0에 코멘트 2개 추가 (commented 정렬 1위용)
  await db.insert(pinComments).values([
    { pinId: firstPinId, createdBy: memberId, content: "댓글 1" },
    { pinId: firstPinId, createdBy: memberId, content: "댓글 2" },
  ]);

  // Pin 2에 접근 기록 추가 (오늘 열람 -> staleness가 오늘이 되어 ggukPick 최후순위로 밀림)
  await db.insert(pinAccesses).values({
    pinId: thirdPinId,
    userId: memberId,
    createdAt: new Date(now),
  });
});

afterAll(async () => {
  await app.close();
});

describe("핀 목록 조회", () => {
  it("roomId 없이 조회하면 내 모든 활성 방의 핀만 반환한다", async () => {
    const placeId = placeIds[0];
    if (!placeId) {
      throw new Error("전체 방 조회용 장소 시드가 없습니다.");
    }
    const seededPins = await db
      .insert(pins)
      .values([
        {
          roomId: roomBId,
          placeId,
          createdBy: memberId,
        },
        {
          roomId: outsiderRoomId,
          placeId,
          createdBy: memberId,
        },
      ])
      .returning({ id: pins.id });
    const roomBPinId = seededPins[0]?.id;
    const outsiderPinId = seededPins[1]?.id;
    if (!roomBPinId || !outsiderPinId) {
      throw new Error("전체 방 조회용 핀 시드에 실패했습니다.");
    }

    const response = await api("/api/v1/pins", memberAuthUid);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Array<{ id: string }> };
    const ids = body.data.map((pin) => pin.id);
    expect(ids).toContain(roomBPinId);
    expect(ids).not.toContain(outsiderPinId);

    await db.delete(pins).where(
      inArray(
        pins.id,
        seededPins.map((pin) => pin.id),
      ),
    );
  });

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

  it("기본 정렬(sort=all 및 sort=latest)은 최신 저장순으로 반환한다", async () => {
    const response = await api(
      `/api/v1/pins?roomId=${roomAId}&sort=latest`,
      memberAuthUid,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ id: string }>;
    };
    // Pin 2(1일 전) > Pin 1(2일 전) > Pin 0(3일 전)
    expect(body.data.map((p) => p.id)).toEqual([
      thirdPinId,
      secondPinId,
      firstPinId,
    ]);
  });

  it("sort=ggukPick은 오래 들여다보지 않은 순서로 반환한다", async () => {
    const response = await api(
      `/api/v1/pins?roomId=${roomAId}&sort=ggukPick`,
      memberAuthUid,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ id: string }>;
    };
    // Pin 0(3일 전 미열람) > Pin 1(2일 전 미열람) > Pin 2(오늘 열람)
    expect(body.data.map((p) => p.id)).toEqual([
      firstPinId,
      secondPinId,
      thirdPinId,
    ]);
  });

  it("sort=distance는 요청 좌표와 가까운 순서로 반환한다", async () => {
    // Pin 2 좌표: (37.5645, 127.0559) 바로 근처에서 조회
    const response = await api(
      `/api/v1/pins?roomId=${roomAId}&sort=distance&lat=37.5645&lng=127.0559`,
      memberAuthUid,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ id: string }>;
    };
    // Pin 2 (거리 0m) > Pin 1 (약 1.1km) > Pin 0 (약 2.2km)
    expect(body.data.map((p) => p.id)).toEqual([
      thirdPinId,
      secondPinId,
      firstPinId,
    ]);
  });

  it("sort=distance인데 lat/lng가 없으면 400 에러를 반환한다", async () => {
    const response = await api(
      `/api/v1/pins?roomId=${roomAId}&sort=distance`,
      memberAuthUid,
    );
    expect(response.status).toBe(400);
  });

  it("sort=commented는 코멘트가 많은 순서로 반환한다", async () => {
    const response = await api(
      `/api/v1/pins?roomId=${roomAId}&sort=commented`,
      memberAuthUid,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ id: string }>;
    };
    // Pin 0(코멘트 2개) > Pin 2(최신, 0개) > Pin 1(0개)
    expect(body.data[0]?.id).toBe(firstPinId);
  });

  it("category=cafe는 카페 장소만 필터링한다", async () => {
    const response = await api(
      `/api/v1/pins?roomId=${roomAId}&category=cafe`,
      memberAuthUid,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ id: string; place: { category: string } }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(firstPinId);
    expect(body.data[0]?.place.category).toContain("카페");
  });

  it("category=restaurant는 카페를 제외한 음식점 장소만 필터링한다", async () => {
    const response = await api(
      `/api/v1/pins?roomId=${roomAId}&category=restaurant`,
      memberAuthUid,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ id: string; place: { category: string } }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(secondPinId);
    expect(body.data[0]?.place.category).toContain("한식");
  });

  it("category=all은 모든 카테고리를 반환한다", async () => {
    const response = await api(
      `/api/v1/pins?roomId=${roomAId}&category=all`,
      memberAuthUid,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ id: string }>;
    };
    expect(body.data).toHaveLength(3);
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

  it("Google provider 장소의 미매핑 카테고리(bar)는 전체(all)에서만 보인다", async () => {
    const [googlePlace] = await db
      .insert(places)
      .values({
        provider: "google",
        providerPlaceId: `google-bar-${randomUUID()}`,
        name: "구글 루프탑 바",
        category: "bar",
        categoryGroup: classifyPlaceCategory("bar"),
        address: "서울 강남구 테헤란로 1",
        lat: 37.5,
        lng: 127.0,
      })
      .returning();
    const [googlePin] = await db
      .insert(pins)
      .values({
        roomId: roomAId,
        placeId: googlePlace!.id,
        createdBy: memberId,
      })
      .returning();

    const allRes = await api(
      `/api/v1/pins?roomId=${roomAId}&category=all`,
      memberAuthUid,
    );
    const allBody = (await allRes.json()) as { data: Array<{ id: string }> };
    expect(allBody.data.some((p) => p.id === googlePin!.id)).toBe(true);

    const cafeRes = await api(
      `/api/v1/pins?roomId=${roomAId}&category=cafe`,
      memberAuthUid,
    );
    const cafeBody = (await cafeRes.json()) as { data: Array<{ id: string }> };
    expect(cafeBody.data.some((p) => p.id === googlePin!.id)).toBe(false);

    const restRes = await api(
      `/api/v1/pins?roomId=${roomAId}&category=restaurant`,
      memberAuthUid,
    );
    const restBody = (await restRes.json()) as { data: Array<{ id: string }> };
    expect(restBody.data.some((p) => p.id === googlePin!.id)).toBe(false);

    await db.delete(pins).where(eq(pins.id, googlePin!.id));
    await db.delete(places).where(eq(places.id, googlePlace!.id));
  });

  it("soft-deleted 핀은 목록에서 격리되어 보이지 않는다", async () => {
    const [deletedPin] = await db
      .insert(pins)
      .values({
        roomId: roomAId,
        placeId: placeIds[0]!,
        createdBy: memberId,
        deletedAt: new Date(),
      })
      .returning();

    const res = await api(`/api/v1/pins?roomId=${roomAId}`, memberAuthUid);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data.some((p) => p.id === deletedPin!.id)).toBe(false);

    await db.delete(pins).where(eq(pins.id, deletedPin!.id));
  });

  it("soft-deleted 코멘트는 commented 정렬 카운트에서 제외된다", async () => {
    const delComments = await db
      .insert(pinComments)
      .values(
        [1, 2, 3, 4, 5].map((i) => ({
          pinId: secondPinId,
          createdBy: memberId,
          content: `삭제된 코멘트 ${i}`,
          deletedAt: new Date(),
        })),
      )
      .returning();

    const res = await api(
      `/api/v1/pins?roomId=${roomAId}&sort=commented`,
      memberAuthUid,
    );
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data[0]?.id).toBe(firstPinId);

    await db.delete(pinComments).where(
      inArray(
        pinComments.id,
        delComments.map((c) => c.id),
      ),
    );
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

describe("장소(핀) 삭제", () => {
  it("방 멤버가 핀을 삭제하면 soft delete되고 목록에서 사라진다", async () => {
    // 삭제 전용 장소, 핀 및 코멘트 추가
    const [delPlace] = await db
      .insert(places)
      .values({
        provider: "kakao",
        providerPlaceId: `e2e-del-place-${randomUUID()}`,
        name: "삭제 테스트 장소",
        address: "서울시 강남구",
        category: "음식점 > 카페",
        categoryGroup: "cafe",
        lat: 37.5,
        lng: 127.0,
      })
      .returning();

    const [targetPin] = await db
      .insert(pins)
      .values({
        roomId: roomAId,
        placeId: delPlace?.id ?? "",
        createdBy: memberId,
      })
      .returning();
    const pinId = targetPin?.id ?? "";

    const [comment] = await db
      .insert(pinComments)
      .values({
        pinId,
        createdBy: memberId,
        content: "삭제될 코멘트",
      })
      .returning();
    const commentId = comment?.id ?? "";

    // 삭제 전 목록에 있는지 확인
    const beforeList = await api(
      `/api/v1/pins?roomId=${roomAId}`,
      memberAuthUid,
    );
    const beforeBody = (await beforeList.json()) as {
      data: Array<{ id: string }>;
    };
    expect(beforeBody.data.some((p) => p.id === pinId)).toBe(true);

    // DELETE 요청
    const deleteRes = await api(`/api/v1/pins/${pinId}`, memberAuthUid, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);
    expect(await deleteRes.json()).toEqual({ data: { ok: true } });

    // 삭제 후 목록에서 제외 확인
    const afterList = await api(
      `/api/v1/pins?roomId=${roomAId}`,
      memberAuthUid,
    );
    const afterBody = (await afterList.json()) as {
      data: Array<{ id: string }>;
    };
    expect(afterBody.data.some((p) => p.id === pinId)).toBe(false);

    // DB에서 pin과 comment의 deletedAt이 설정되었는지 확인
    const [pinRow] = await db.select().from(pins).where(eq(pins.id, pinId));
    expect(pinRow?.deletedAt).not.toBeNull();

    const [commentRow] = await db
      .select()
      .from(pinComments)
      .where(eq(pinComments.id, commentId));
    expect(commentRow?.deletedAt).not.toBeNull();
  });

  it("이미 삭제되었거나 존재하지 않는 핀은 404를 반환한다", async () => {
    const fakePinId = randomUUID();
    const response = await api(`/api/v1/pins/${fakePinId}`, memberAuthUid, {
      method: "DELETE",
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("PIN_NOT_FOUND");
  });

  it("방 멤버가 아닌 유저가 핀 삭제 시 403을 반환한다", async () => {
    const response = await api(`/api/v1/pins/${firstPinId}`, outsiderAuthUid, {
      method: "DELETE",
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("NOT_ROOM_MEMBER");
  });

  it("유효하지 않은 UUID는 400을 반환한다", async () => {
    const response = await api("/api/v1/pins/not-a-uuid", memberAuthUid, {
      method: "DELETE",
    });
    expect(response.status).toBe(400);
  });
});
