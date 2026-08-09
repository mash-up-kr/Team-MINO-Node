import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { SentryErrorReporter } from "../../../src/infrastructures/sentry/sentry-reporter";
import { InvitationRepository } from "../../../src/modules/invitation/invitation.repository";
import { invitations } from "../../../src/modules/invitation/invitation.schema";
import { pins } from "../../../src/modules/pin/pin.schema";
import { places } from "../../../src/modules/place/place.schema";
import { rooms } from "../../../src/modules/room/room.schema";
import { roomMembers } from "../../../src/modules/room/room-member.schema";
import { users } from "../../../src/modules/user/user.schema";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;
let db: DatabaseService["db"];

// 시나리오 파일끼리 DB를 공유하므로 기기 식별자를 매 실행 고유하게 만듭니다.
const ownerDeviceId = `e2e-invite-owner-${randomUUID()}`;
const memberDeviceId = `e2e-invite-member-${randomUUID()}`;
const outsiderDeviceId = `e2e-invite-outsider-${randomUUID()}`;
const personalInviteCode = randomUUID()
  .replace(/[^a-z0-9]/g, "")
  .slice(0, 6)
  .toUpperCase();

let sharedRoomId: string;
let personalRoomId: string;

function api(
  path: string,
  deviceId: string | null,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(deviceId ? { "X-Device-Id": deviceId } : {}),
      ...init.headers,
    },
  });
}

function createInvitation(roomId: string, deviceId: string) {
  return api(`/api/v1/rooms/${roomId}/invitations`, deviceId, {
    method: "POST",
  });
}

async function createdCode(roomId: string, deviceId: string): Promise<string> {
  const response = await createInvitation(roomId, deviceId);
  const { data } = await response.json();
  return data.code;
}

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SentryErrorReporter)
      .useValue({ report: () => undefined }),
  ));
  db = app.get(DatabaseService).db;

  // 반환 순서에 기대지 않도록 device_id로 되짚습니다.
  const insertedUsers = await db
    .insert(users)
    .values([
      {
        deviceId: ownerDeviceId,
        nickname: "지은",
        avatar: { id: 1 },
      },
      { deviceId: memberDeviceId, nickname: "민호" },
      { deviceId: outsiderDeviceId, nickname: "외부인" },
    ])
    .returning({ id: users.id, deviceId: users.deviceId });
  const userIdOf = (deviceId: string): string => {
    const id = insertedUsers.find((u) => u.deviceId === deviceId)?.id;
    if (!id) throw new Error(`유저 픽스처 없음: ${deviceId}`);
    return id;
  };
  const ownerId = userIdOf(ownerDeviceId);

  const insertedRooms = await db
    .insert(rooms)
    .values(
      (["shared", "personal"] as const).map((type) => ({
        ownerId,
        type,
        name: type === "shared" ? "5월의 약속 : 우리끼리" : "내 방",
        description: "우리 모임 장소 픽업 공간.",
        color: "#FF6B6B",
      })),
    )
    .returning({ id: rooms.id, type: rooms.type });
  const roomIdOf = (type: "shared" | "personal"): string => {
    const id = insertedRooms.find((r) => r.type === type)?.id;
    if (!id) throw new Error(`방 픽스처 없음: ${type}`);
    return id;
  };
  sharedRoomId = roomIdOf("shared");
  personalRoomId = roomIdOf("personal");

  await db.insert(roomMembers).values([
    { roomId: sharedRoomId, userId: ownerId },
    { roomId: sharedRoomId, userId: userIdOf(memberDeviceId) },
    { roomId: personalRoomId, userId: ownerId },
  ]);

  const [place] = await db
    .insert(places)
    .values({
      provider: "kakao",
      providerPlaceId: `kakao-${randomUUID()}`,
      name: "어니언 성수",
      address: "서울 성동구 아차산로 8",
      lat: 37.5445,
      lng: 127.0559,
    })
    .returning({ id: places.id });
  if (!place) throw new Error("장소 픽스처 생성 실패");

  await db.insert(pins).values({ roomId: sharedRoomId, placeId: place.id });

  // 개인방은 API로 초대를 발급할 수 없어 DB에 직접 심습니다.
  await db.insert(invitations).values({
    roomId: personalRoomId,
    invitedBy: ownerId,
    code: personalInviteCode,
  });
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/v1/rooms/:roomId/invitations", () => {
  it("같은 멤버가 다시 요청하면 같은 코드를 돌려준다", async () => {
    // when
    const response = await createInvitation(sharedRoomId, ownerDeviceId);
    const first = (await response.json()).data.code;
    const second = await createdCode(sharedRoomId, ownerDeviceId);

    // then
    // 생성이 아니라 get-or-create라 201이 아닌 200이다.
    expect(response.status).toBe(200);
    expect(first).toBe(second);
  });

  it("멤버마다 다른 코드를 발급한다", async () => {
    // when
    const ownerCode = await createdCode(sharedRoomId, ownerDeviceId);
    const memberCode = await createdCode(sharedRoomId, memberDeviceId);

    // then
    expect(ownerCode).not.toBe(memberCode);
  });

  it("방 멤버가 아니면 403을 반환한다", async () => {
    // when
    const response = await createInvitation(sharedRoomId, outsiderDeviceId);

    // then
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("NOT_ROOM_MEMBER");
  });

  it("개인방은 초대할 수 없다", async () => {
    // when
    const response = await createInvitation(personalRoomId, ownerDeviceId);

    // then
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("PERSONAL_ROOM_NOT_ALLOWED");
  });

  it("유저를 식별할 수 없으면 401을 반환한다", async () => {
    // when
    const response = await api(
      `/api/v1/rooms/${sharedRoomId}/invitations`,
      null,
      { method: "POST" },
    );

    // then
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe("UNIDENTIFIED_USER");
  });
});

describe("초대 코드 충돌", () => {
  // 36^6 공간에서는 충돌을 자연 발생시킬 수 없어, 리포지토리를 직접 호출하며
  // 생성기만 결정적인 것으로 바꿔 끼웁니다.
  it("이미 쓰이는 코드가 나오면 새 코드로 재시도해 발급한다", async () => {
    // given
    const freeCode = "BCDFGH";
    const [requester] = await db
      .insert(users)
      .values({
        deviceId: `e2e-invite-collision-${randomUUID()}`,
        nickname: "충돌",
      })
      .returning({ id: users.id });
    if (!requester) throw new Error("유저 픽스처 생성 실패");
    await db
      .insert(roomMembers)
      .values({ roomId: sharedRoomId, userId: requester.id });
    // personalInviteCode는 beforeAll에서 심어둔 초대가 이미 점유한 코드다.
    const queued = [personalInviteCode, freeCode];

    // when
    const created = await app
      .get(InvitationRepository)
      .createInvitation(sharedRoomId, requester.id, () => queued.shift() ?? "");

    // then
    expect(created.code).toBe(freeCode);
  });
});
