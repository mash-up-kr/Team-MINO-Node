import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { and, eq, isNull } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { MessagingService } from "../../../src/infrastructures/messaging/messaging.service";
import { SentryErrorReporter } from "../../../src/infrastructures/sentry/sentry-reporter";
import { InvitationRepository } from "../../../src/modules/invitation/invitation.repository";
import { invitations } from "../../../src/modules/invitation/invitation.schema";
import { notifications } from "../../../src/modules/notification/notification.schema";
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

// 시나리오 파일끼리 DB를 공유하므로 인증 식별자를 매 실행 고유하게 만듭니다.
const ownerAuthUid = `e2e-invite-owner-${randomUUID()}`;
const memberAuthUid = `e2e-invite-member-${randomUUID()}`;
const joinerAuthUid = `e2e-invite-joiner-${randomUUID()}`;
const outsiderAuthUid = `e2e-invite-outsider-${randomUUID()}`;
const personalInviteCode = randomUUID()
  .replace(/[^a-z0-9]/g, "")
  .slice(0, 6)
  .toUpperCase();

let ownerId: string;
let joinerId: string;
let sharedRoomId: string;
let personalRoomId: string;
const sentTokens: string[][] = [];

function api(
  path: string,
  authUid: string | null,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(authUid ? authHeaders(authUid) : {}),
      ...init.headers,
    },
  });
}

function createInvitation(roomId: string, authUid: string) {
  return api(`/api/v1/rooms/${roomId}/invitations`, authUid, {
    method: "POST",
  });
}

function joinRoom(roomId: string, authUid: string, inviteCode: string) {
  return api(`/api/v1/rooms/${roomId}/members`, authUid, {
    method: "POST",
    body: JSON.stringify({ inviteCode }),
  });
}

function activeMemberships(roomId: string, userId: string) {
  return db
    .select({ id: roomMembers.id })
    .from(roomMembers)
    .where(
      and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.userId, userId),
        isNull(roomMembers.deletedAt),
      ),
    );
}

async function createdCode(roomId: string, authUid: string): Promise<string> {
  const response = await createInvitation(roomId, authUid);
  const { data } = await response.json();
  return data.code;
}

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    withFakeTokenVerifier(
      Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(SentryErrorReporter)
        .useValue({ report: () => undefined })
        // 실제 ADC 발급을 시도하지 않도록 발송만 스텁으로 대체한다.
        .overrideProvider(MessagingService)
        .useValue({
          sendToTokens: (tokens: string[]) => {
            sentTokens.push(tokens);
            return Promise.resolve();
          },
        }),
    ),
  ));
  db = app.get(DatabaseService).db;

  // 반환 순서에 기대지 않도록 auth_uid로 되짚습니다.
  const insertedUsers = await db
    .insert(users)
    .values([
      {
        authUid: ownerAuthUid,
        nickname: "지은",
        avatar: { color: "red" },
        fcmToken: "owner-fcm-token",
      },
      { authUid: memberAuthUid, nickname: "민호" },
      { authUid: joinerAuthUid, nickname: "재성" },
      { authUid: outsiderAuthUid, nickname: "외부인" },
    ])
    .returning({ id: users.id, authUid: users.authUid });
  const userIdOf = (authUid: string): string => {
    const id = insertedUsers.find((u) => u.authUid === authUid)?.id;
    if (!id) throw new Error(`유저 픽스처 없음: ${authUid}`);
    return id;
  };
  ownerId = userIdOf(ownerAuthUid);
  joinerId = userIdOf(joinerAuthUid);

  const insertedRooms = await db
    .insert(rooms)
    .values(
      (["shared", "personal"] as const).map((type) => ({
        ownerId,
        type,
        name: type === "shared" ? "5월의 약속 : 우리끼리" : "내 방",
        description: "우리 모임 장소 픽업 공간.",
        color: "red",
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
    { roomId: sharedRoomId, userId: userIdOf(memberAuthUid) },
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
    const response = await createInvitation(sharedRoomId, ownerAuthUid);
    const first = (await response.json()).data.code;
    const second = await createdCode(sharedRoomId, ownerAuthUid);

    // then
    // 생성이 아니라 get-or-create라 201이 아닌 200이다.
    expect(response.status).toBe(200);
    expect(first).toBe(second);
  });

  it("멤버마다 다른 코드를 발급한다", async () => {
    // when
    const ownerCode = await createdCode(sharedRoomId, ownerAuthUid);
    const memberCode = await createdCode(sharedRoomId, memberAuthUid);

    // then
    expect(ownerCode).not.toBe(memberCode);
  });

  it("방 멤버가 아니면 403을 반환한다", async () => {
    // when
    const response = await createInvitation(sharedRoomId, outsiderAuthUid);

    // then
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("NOT_ROOM_MEMBER");
  });

  it("개인방은 초대할 수 없다", async () => {
    // when
    const response = await createInvitation(personalRoomId, ownerAuthUid);

    // then
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("PERSONAL_ROOM_NOT_ALLOWED");
  });

  it("인증 정보가 없으면 401을 반환한다", async () => {
    // when
    const response = await api(
      `/api/v1/rooms/${sharedRoomId}/invitations`,
      null,
      { method: "POST" },
    );

    // then
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe("UNAUTHORIZED");
  });
});

describe("GET /api/v1/invitations/:code", () => {
  it("인증 헤더 없이도 방과 초대자를 보여준다", async () => {
    // given
    const code = await createdCode(sharedRoomId, ownerAuthUid);

    // when
    const response = await api(`/api/v1/invitations/${code}`, null);

    // then
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({
      room: {
        id: sharedRoomId,
        type: "shared",
        name: "5월의 약속 : 우리끼리",
        pinCount: 1,
      },
      inviter: { nickname: "지은" },
    });
  });

  it("초대자가 다르면 미리보기의 초대자도 다르다", async () => {
    // given
    const memberCode = await createdCode(sharedRoomId, memberAuthUid);

    // when
    const response = await api(`/api/v1/invitations/${memberCode}`, null);

    // then
    const { data } = await response.json();
    expect(data.inviter.nickname).toBe("민호");
  });

  it("없는 코드는 404를 반환한다", async () => {
    // when
    const response = await api("/api/v1/invitations/ZZZZZZ", null);

    // then
    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe("INVITATION_NOT_FOUND");
  });

  it("개인방 코드는 거절한다", async () => {
    // when
    const response = await api(
      `/api/v1/invitations/${personalInviteCode}`,
      null,
    );

    // then
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("PERSONAL_ROOM_NOT_ALLOWED");
  });
});

describe("POST /api/v1/rooms/:roomId/members", () => {
  it("초대 코드로 합류하고, 다시 요청해도 멱등하게 성공한다", async () => {
    // given
    const code = await createdCode(sharedRoomId, ownerAuthUid);

    // when
    const first = await joinRoom(sharedRoomId, joinerAuthUid, code);
    const second = await joinRoom(sharedRoomId, joinerAuthUid, code);

    // then
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ data: { ok: true } });
    expect(second.status).toBe(200);
    expect(await activeMemberships(sharedRoomId, joinerId)).toHaveLength(1);
  });

  it("나갔던 방에 다시 합류할 수 있다", async () => {
    // given
    const code = await createdCode(sharedRoomId, ownerAuthUid);
    await joinRoom(sharedRoomId, joinerAuthUid, code);
    // 방 나가기 API는 아직 없어 soft delete를 직접 기록합니다.
    await db
      .update(roomMembers)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(roomMembers.roomId, sharedRoomId),
          eq(roomMembers.userId, joinerId),
        ),
      );
    expect(await activeMemberships(sharedRoomId, joinerId)).toHaveLength(0);

    // when
    const response = await joinRoom(sharedRoomId, joinerAuthUid, code);

    // then
    expect(response.status).toBe(200);
    expect(await activeMemberships(sharedRoomId, joinerId)).toHaveLength(1);
  });

  it("코드가 다른 방의 것이면 400을 반환한다", async () => {
    // given
    const code = await createdCode(sharedRoomId, ownerAuthUid);

    // when
    const response = await joinRoom(personalRoomId, joinerAuthUid, code);

    // then
    expect(response.status).toBe(400);
    expect((await response.json()).errorCode).toBe("INVALID_INVITE_CODE");
  });

  it("개인방 코드로는 합류할 수 없다", async () => {
    // when
    const response = await joinRoom(
      personalRoomId,
      joinerAuthUid,
      personalInviteCode,
    );

    // then
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("PERSONAL_ROOM_NOT_ALLOWED");
  });
});

describe("방 합류 알림", () => {
  it("기존 멤버에게는 참가 알림을, 본인에게는 참가 확인을 남기고 토큰이 있으면 발송한다", async () => {
    // given
    const newcomerAuthUid = `e2e-invite-newcomer-${randomUUID()}`;
    const [newcomer] = await db
      .insert(users)
      .values({ authUid: newcomerAuthUid, nickname: "새멤버" })
      .returning({ id: users.id });
    if (!newcomer) throw new Error("유저 픽스처 생성 실패");
    const code = await createdCode(sharedRoomId, ownerAuthUid);
    const sentBefore = sentTokens.length;
    const roomUrl = `https://gguk.org/rooms/${sharedRoomId}`;

    // when
    const response = await joinRoom(sharedRoomId, newcomerAuthUid, code);

    // then
    expect(response.status).toBe(200);
    const memberRow = await db
      .select({
        recipientId: notifications.recipientId,
        type: notifications.type,
        targetName: notifications.targetName,
        url: notifications.url,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, ownerId),
          eq(notifications.type, "ROOM_MEMBER_JOINED"),
          eq(notifications.typeLabel, "새멤버님이 들어왔어요"),
        ),
      );
    expect(memberRow).toEqual([
      {
        recipientId: ownerId,
        type: "ROOM_MEMBER_JOINED",
        targetName: "5월의 약속 : 우리끼리",
        url: roomUrl,
      },
    ]);
    const selfRow = await db
      .select({
        type: notifications.type,
        targetName: notifications.targetName,
        url: notifications.url,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, newcomer.id),
          eq(notifications.type, "ROOM_JOINED_SELF"),
        ),
      );
    expect(selfRow).toEqual([
      {
        type: "ROOM_JOINED_SELF",
        targetName: "5월의 약속 : 우리끼리",
        url: roomUrl,
      },
    ]);
    // owner만 fcmToken을 가지고 있어 발송은 owner 몫 1건만 나간다.
    expect(sentTokens.slice(sentBefore)).toEqual([["owner-fcm-token"]]);
  });

  it("이미 멤버면 알림을 다시 남기지 않는다", async () => {
    // given
    const code = await createdCode(sharedRoomId, ownerAuthUid);
    const before = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, joinerId),
          eq(notifications.type, "ROOM_JOINED_SELF"),
        ),
      );

    // when
    await joinRoom(sharedRoomId, joinerAuthUid, code);

    // then
    const after = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, joinerId),
          eq(notifications.type, "ROOM_JOINED_SELF"),
        ),
      );
    expect(after).toHaveLength(before.length);
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
        authUid: `e2e-invite-collision-${randomUUID()}`,
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
