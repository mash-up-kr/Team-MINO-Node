import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { rooms } from "../../../src/modules/room/room.schema";
import { roomMembers } from "../../../src/modules/room/room-member.schema";
import { users } from "../../../src/modules/user/user.schema";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;
let db: DatabaseService["db"];

const ownerDevice = `e2e-room-owner-${randomUUID()}`;
const memberDevice = `e2e-room-member-${randomUUID()}`;
let ownerId: string;
let memberId: string;
let personalRoomId: string;

function api(
  path: string,
  deviceId: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "X-Device-Id": deviceId,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    Test.createTestingModule({ imports: [AppModule] }),
  ));
  db = app.get(DatabaseService).db;

  // 유저 등록 API는 별도 PR(user) 소관이라 시드로 대체한다
  const seeded = await db
    .insert(users)
    .values([
      { deviceId: ownerDevice, nickname: "방장" },
      { deviceId: memberDevice, nickname: "멤버" },
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
      color: "black",
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
    const response = await api("/api/v1/rooms", ownerDevice, {
      method: "POST",
      body: JSON.stringify({
        name: "  맛집 탐방  ",
        description: "우리끼리",
        color: "coral",
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

  it("방 이름 15자 초과는 400", async () => {
    const response = await api("/api/v1/rooms", ownerDevice, {
      method: "POST",
      body: JSON.stringify({ name: "가".repeat(16), color: "coral" }),
    });
    expect(response.status).toBe(400);
  });

  it("내가 속한 방 목록에 개인방과 공동방이 함께 온다", async () => {
    const response = await api("/api/v1/rooms?showUsers=true", ownerDevice);

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
  });

  it("멤버가 아닌 유저의 방 상세 조회는 403", async () => {
    const response = await api(`/api/v1/rooms/${sharedRoomId}`, memberDevice);
    expect(response.status).toBe(403);
  });

  it("방장이 아닌 멤버의 방 편집은 403", async () => {
    await db
      .insert(roomMembers)
      .values({ roomId: sharedRoomId, userId: memberId });

    const response = await api(`/api/v1/rooms/${sharedRoomId}`, memberDevice, {
      method: "PATCH",
      body: JSON.stringify({ name: "바꿔버리기" }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("NOT_ROOM_OWNER");
  });

  it("방장은 이름·설명·색상을 수정할 수 있다", async () => {
    const response = await api(`/api/v1/rooms/${sharedRoomId}`, ownerDevice, {
      method: "PATCH",
      body: JSON.stringify({ name: "새 이름", color: "navy" }),
    });

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { name: string; color: string };
    };
    expect(data.name).toBe("새 이름");
    expect(data.color).toBe("navy");
  });

  it("방 멤버 목록에 방장 여부가 표시된다", async () => {
    const response = await api(
      `/api/v1/rooms/${sharedRoomId}/members`,
      memberDevice,
    );

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: Array<{ userId: string; isOwner: boolean }>;
    };
    expect(data).toHaveLength(2);
    expect(data.find((m) => m.userId === ownerId)?.isOwner).toBe(true);
    expect(data.find((m) => m.userId === memberId)?.isOwner).toBe(false);
  });

  it("다른 멤버가 있는 방의 방장 나가기는 409", async () => {
    const response = await api(
      `/api/v1/rooms/${sharedRoomId}/members/me`,
      ownerDevice,
      { method: "DELETE" },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("OWNER_TRANSFER_REQUIRED");
  });

  it("활성 멤버가 아닌 대상으로의 위임은 400", async () => {
    const response = await api(
      `/api/v1/rooms/${sharedRoomId}/owner`,
      ownerDevice,
      { method: "PUT", body: JSON.stringify({ nextOwnerId: randomUUID() }) },
    );
    expect(response.status).toBe(400);
  });

  it("위임 후에는 방장이 나갈 수 있다", async () => {
    const transfer = await api(
      `/api/v1/rooms/${sharedRoomId}/owner`,
      ownerDevice,
      { method: "PUT", body: JSON.stringify({ nextOwnerId: memberId }) },
    );
    expect(transfer.status).toBe(200);
    expect(await transfer.json()).toEqual({ data: { ok: true } });

    const leave = await api(
      `/api/v1/rooms/${sharedRoomId}/members/me`,
      ownerDevice,
      { method: "DELETE" },
    );
    expect(leave.status).toBe(200);

    const list = await api("/api/v1/rooms", ownerDevice);
    const { data } = (await list.json()) as {
      data: Array<{ id: string }>;
    };
    expect(data.some((room) => room.id === sharedRoomId)).toBe(false);
  });

  it("마지막 멤버(새 방장)가 나가면 방이 삭제된다", async () => {
    const leave = await api(
      `/api/v1/rooms/${sharedRoomId}/members/me`,
      memberDevice,
      { method: "DELETE" },
    );
    expect(leave.status).toBe(200);

    const detail = await api(`/api/v1/rooms/${sharedRoomId}`, memberDevice);
    expect(detail.status).toBe(404);
  });
});

describe("개인방 제약", () => {
  it("개인방 나가기는 403", async () => {
    const response = await api(
      `/api/v1/rooms/${personalRoomId}/members/me`,
      ownerDevice,
      { method: "DELETE" },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe("PERSONAL_ROOM_NOT_ALLOWED");
  });
});
