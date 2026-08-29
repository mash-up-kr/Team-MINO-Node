import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { pins } from "../../../src/modules/pin/pin.schema";
import { places } from "../../../src/modules/place/place.schema";
import { rooms } from "../../../src/modules/room/room.schema";
import { roomMembers } from "../../../src/modules/room/room-member.schema";
import { users } from "../../../src/modules/user/user.schema";
import { authHeaders, withFakeTokenVerifier } from "../../auth";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;
let db: DatabaseService["db"];

const ownerAuthUid = `e2e-room-owner-${randomUUID()}`;
const memberAuthUid = `e2e-room-member-${randomUUID()}`;
let ownerId: string;
let memberId: string;
let personalRoomId: string;

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

  // 유저 등록 API는 별도 PR(user) 소관이라 시드로 대체한다
  const seeded = await db
    .insert(users)
    .values([
      { authUid: ownerAuthUid, nickname: "방장", avatar: { color: "red" } },
      { authUid: memberAuthUid, nickname: "멤버", avatar: { color: "blue" } },
    ])
    .returning({ id: users.id });
  ownerId = seeded[0]?.id as string;
  memberId = seeded[1]?.id as string;

  // 개인방 시드 (자동 생성은 user PR 소관)
  const [personalRoom] = await db
    .insert(rooms)
    .values({
      ownerId,
      type: "personal",
      name: "내 방",
      color: "gray",
    })
    .returning({ id: rooms.id });
  personalRoomId = personalRoom?.id as string;
  await db
    .insert(roomMembers)
    .values({ roomId: personalRoomId, userId: ownerId });
});

afterAll(async () => {
  await app.close();
});

describe("공동방 생성·조회", () => {
  let sharedRoomId: string;

  it("공동방을 생성하면 생성자가 방장이 된다", async () => {
    const response = await api("/api/v1/rooms", ownerAuthUid, {
      method: "POST",
      body: JSON.stringify({
        name: "  맛집 탐방  ",
        description: "우리끼리",
        color: "pink",
      }),
    });

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as {
      data: Record<string, unknown>;
    };
    expect(data.name).toBe("맛집 탐방"); // 앞뒤 공백 제거
    expect(data.type).toBe("shared");
    expect(data.ownerId).toBe(ownerId);
    sharedRoomId = data.id as string;
  });

  it("개인방은 편집할 수 없다 (403)", async () => {
    const response = await api(
      `/api/v1/rooms/${personalRoomId}`,
      ownerAuthUid,
      {
        method: "PATCH",
        body: JSON.stringify({ name: "이름 변경 시도" }),
      },
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("PERSONAL_ROOM_NOT_ALLOWED");
  });

  it("팔레트 외 색상은 400", async () => {
    const response = await api("/api/v1/rooms", ownerAuthUid, {
      method: "POST",
      body: JSON.stringify({ name: "색상 검증", color: "#FF6B6B" }),
    });
    expect(response.status).toBe(400);
  });

  it("방 이름 15자 초과는 400", async () => {
    const response = await api("/api/v1/rooms", ownerAuthUid, {
      method: "POST",
      body: JSON.stringify({ name: "가".repeat(16), color: "pink" }),
    });
    expect(response.status).toBe(400);
  });

  it("내가 속한 방 목록에 개인방과 공동방이 함께 온다", async () => {
    const response = await api("/api/v1/rooms?showUsers=true", ownerAuthUid);

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: Array<Record<string, unknown>>;
    };
    const types = data.map((room) => room.type).sort();
    expect(types).toEqual(["personal", "shared"]);
    const shared = data.find((room) => room.id === sharedRoomId);
    expect(shared?.memberCount).toBe(1);
    expect(shared?.pinCount).toBe(0);
    expect((shared?.users as unknown[]).length).toBe(1);
    // 핀이 없는 방은 방 대표 색상 키로 폴백 (기획: 색+캐릭터 렌더링)
    expect(shared?.thumbnailList).toEqual(["pink"]);
  });

  it("방 설명은 30자까지 허용하고 31자는 400", async () => {
    const ok = await api("/api/v1/rooms", ownerAuthUid, {
      method: "POST",
      body: JSON.stringify({
        name: "설명 30자 방",
        description: "가".repeat(30),
        color: "pink",
      }),
    });
    expect(ok.status).toBe(201);

    const tooLong = await api("/api/v1/rooms", ownerAuthUid, {
      method: "POST",
      body: JSON.stringify({
        name: "설명 31자 방",
        description: "가".repeat(31),
        color: "pink",
      }),
    });
    expect(tooLong.status).toBe(400);
  });

  it("방 이름에 허용 외 문자(이모지)는 400", async () => {
    const response = await api("/api/v1/rooms", ownerAuthUid, {
      method: "POST",
      body: JSON.stringify({ name: "맛집 🍕", color: "pink" }),
    });
    expect(response.status).toBe(400);
  });

  it("멤버가 아닌 유저의 방 상세 조회는 403", async () => {
    const response = await api(`/api/v1/rooms/${sharedRoomId}`, memberAuthUid);
    expect(response.status).toBe(403);
  });

  it("방장이 아닌 멤버의 방 편집은 403", async () => {
    await db
      .insert(roomMembers)
      .values({ roomId: sharedRoomId, userId: memberId });

    const response = await api(`/api/v1/rooms/${sharedRoomId}`, memberAuthUid, {
      method: "PATCH",
      body: JSON.stringify({ name: "바꿔버리기" }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("NOT_ROOM_OWNER");
  });

  it("방장은 이름·설명·색상을 수정할 수 있다", async () => {
    const response = await api(`/api/v1/rooms/${sharedRoomId}`, ownerAuthUid, {
      method: "PATCH",
      body: JSON.stringify({ name: "새 이름", color: "blue" }),
    });

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { name: string; color: string };
    };
    expect(data.name).toBe("새 이름");
    expect(data.color).toBe("blue");
  });

  it("방 멤버 목록에 방장 여부가 표시된다", async () => {
    const response = await api(
      `/api/v1/rooms/${sharedRoomId}/members`,
      memberAuthUid,
    );

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: Array<{ userId: string; isOwner: boolean }>;
    };
    expect(data).toHaveLength(2);
    expect(data.find((m) => m.userId === ownerId)?.isOwner).toBe(true);
    expect(data.find((m) => m.userId === memberId)?.isOwner).toBe(false);
  });

  it("멤버 목록은 최근에 장소를 저장한 멤버가 먼저 온다", async () => {
    const [sortRoom] = await db
      .insert(rooms)
      .values({ ownerId, type: "shared", name: "정렬 검증 방", color: "blue" })
      .returning({ id: rooms.id });
    const sortRoomId = sortRoom?.id as string;
    await db.insert(roomMembers).values([
      { roomId: sortRoomId, userId: ownerId },
      { roomId: sortRoomId, userId: memberId },
    ]);

    const [place] = await db
      .insert(places)
      .values({
        provider: "kakao" as const,
        providerPlaceId: `e2e-sort-${randomUUID()}`,
        name: "정렬용 장소",
        address: "서울 성동구 상원4길 10",
        lat: 37.52,
        lng: 127.0559,
      })
      .returning({ id: places.id });
    // 나중에 가입한 memberId가 핀을 저장 → 목록 맨 앞에 와야 한다
    await db.insert(pins).values({
      roomId: sortRoomId,
      placeId: place?.id as string,
      createdBy: memberId,
    });

    const response = await api(
      `/api/v1/rooms/${sortRoomId}/members`,
      ownerAuthUid,
    );
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: Array<{ userId: string }>;
    };
    expect(data.map((m) => m.userId)).toEqual([memberId, ownerId]);
  });

  it("다른 멤버가 있는 방의 방장 나가기는 409", async () => {
    const response = await api(
      `/api/v1/rooms/${sharedRoomId}/members/me`,
      ownerAuthUid,
      { method: "DELETE" },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("OWNER_TRANSFER_REQUIRED");
  });

  it("활성 멤버가 아닌 대상으로의 위임은 400", async () => {
    const response = await api(
      `/api/v1/rooms/${sharedRoomId}/owner`,
      ownerAuthUid,
      { method: "PUT", body: JSON.stringify({ nextOwnerId: randomUUID() }) },
    );
    expect(response.status).toBe(400);
  });

  it("위임 후에는 방장이 나갈 수 있다", async () => {
    const transfer = await api(
      `/api/v1/rooms/${sharedRoomId}/owner`,
      ownerAuthUid,
      { method: "PUT", body: JSON.stringify({ nextOwnerId: memberId }) },
    );
    expect(transfer.status).toBe(200);
    expect(await transfer.json()).toEqual({ data: { ok: true } });

    const leave = await api(
      `/api/v1/rooms/${sharedRoomId}/members/me`,
      ownerAuthUid,
      { method: "DELETE" },
    );
    expect(leave.status).toBe(200);

    const list = await api("/api/v1/rooms", ownerAuthUid);
    const { data } = (await list.json()) as {
      data: Array<{ id: string }>;
    };
    expect(data.some((room) => room.id === sharedRoomId)).toBe(false);
  });

  it("마지막 멤버(새 방장)가 나가면 방이 삭제된다", async () => {
    const leave = await api(
      `/api/v1/rooms/${sharedRoomId}/members/me`,
      memberAuthUid,
      { method: "DELETE" },
    );
    expect(leave.status).toBe(200);

    const detail = await api(`/api/v1/rooms/${sharedRoomId}`, memberAuthUid);
    expect(detail.status).toBe(404);
  });
});

describe("개인방 제약", () => {
  it("개인방 나가기는 403", async () => {
    const response = await api(
      `/api/v1/rooms/${personalRoomId}/members/me`,
      ownerAuthUid,
      { method: "DELETE" },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("PERSONAL_ROOM_NOT_ALLOWED");
  });
});

describe("방 목록 썸네일", () => {
  it("최근 핀의 장소 이미지 최대 4개를 최신순으로 내린다", async () => {
    const [thumbRoom] = await db
      .insert(rooms)
      .values({ ownerId, type: "shared", name: "썸네일 방", color: "blue" })
      .returning({ id: rooms.id });
    const thumbRoomId = thumbRoom?.id as string;
    await db
      .insert(roomMembers)
      .values({ roomId: thumbRoomId, userId: ownerId });

    // 이미지 있는 장소 5개 + 없는 장소 1개
    const seededPlaces = await db
      .insert(places)
      .values(
        [1, 2, 3, 4, 5, 6].map((n) => ({
          provider: "kakao" as const,
          providerPlaceId: `e2e-thumb-${randomUUID()}`,
          name: `썸네일 장소 ${n}`,
          address: "서울 성동구 상원4길 10",
          lat: 37.5445 + n * 0.001,
          lng: 127.0559,
          images: n <= 5 ? [`https://img.example.com/thumb-${n}.jpg`] : null,
        })),
      )
      .returning({ id: places.id });

    // createdAt을 명시해 저장 순서를 고정한다 — 6번(이미지 없음)이 가장 최신
    const base = Date.parse("2026-01-01T00:00:00Z");
    await db.insert(pins).values(
      seededPlaces.map((place, index) => ({
        roomId: thumbRoomId,
        placeId: place.id,
        createdBy: ownerId,
        createdAt: new Date(base + (index + 1) * 60_000),
      })),
    );

    const response = await api("/api/v1/rooms", ownerAuthUid);
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: Array<Record<string, unknown>>;
    };
    const room = data.find((entry) => entry.id === thumbRoomId);
    // 이미지 없는 최신 핀(6번)은 건너뛰고, 이미지 있는 핀 중 최신 4개
    expect(room?.thumbnailList).toEqual([
      "https://img.example.com/thumb-5.jpg",
      "https://img.example.com/thumb-4.jpg",
      "https://img.example.com/thumb-3.jpg",
      "https://img.example.com/thumb-2.jpg",
    ]);
  });

  it("핀은 있지만 대표 이미지가 전부 없으면 색상 폴백 없이 빈 목록을 내린다", async () => {
    const [imagelessRoom] = await db
      .insert(rooms)
      .values({
        ownerId,
        type: "shared",
        name: "이미지 없는 방",
        color: "pink",
      })
      .returning({ id: rooms.id });
    const imagelessRoomId = imagelessRoom?.id as string;
    await db
      .insert(roomMembers)
      .values({ roomId: imagelessRoomId, userId: ownerId });

    const [place] = await db
      .insert(places)
      .values({
        provider: "kakao" as const,
        providerPlaceId: `e2e-thumb-${randomUUID()}`,
        name: "이미지 없는 장소",
        address: "서울 성동구 상원4길 10",
        lat: 37.51,
        lng: 127.0559,
        images: null,
      })
      .returning({ id: places.id });
    await db.insert(pins).values({
      roomId: imagelessRoomId,
      placeId: place?.id as string,
      createdBy: ownerId,
    });

    const response = await api("/api/v1/rooms", ownerAuthUid);
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: Array<Record<string, unknown>>;
    };
    const room = data.find((entry) => entry.id === imagelessRoomId);
    expect(room?.pinCount).toBe(1);
    expect(room?.thumbnailList).toEqual([]);
  });
});
