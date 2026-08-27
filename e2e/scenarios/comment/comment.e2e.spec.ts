import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { and, eq, isNull } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { SentryErrorReporter } from "../../../src/infrastructures/sentry/sentry-reporter";
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
let db: DatabaseService["db"];

const ownerAuthUid = `e2e-comment-owner-${randomUUID()}`;
const memberAuthUid = `e2e-comment-member-${randomUUID()}`;
const outsiderAuthUid = `e2e-comment-outsider-${randomUUID()}`;
const departedAuthUid = `e2e-comment-departed-${randomUUID()}`;

let ownerId: string;
let memberId: string;
let departedId: string;
let sharedRoomId: string;
let sharedPinId: string;
let secondSharedPinId: string;
let personalPinId: string;
let deletedPinId: string;
let deletedRoomPinId: string;
let pagedPinId: string;

function api(
  path: string,
  authUid: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(authUid),
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function commentPath(pinId: string): string {
  return `/api/v1/pins/${pinId}/comments`;
}

async function createComment(
  pinId: string,
  authUid: string,
  content: string,
): Promise<Response> {
  return api(commentPath(pinId), authUid, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

async function createPlace(name: string): Promise<string> {
  const [place] = await db
    .insert(places)
    .values({
      provider: "kakao",
      providerPlaceId: `${name}-${randomUUID()}`,
      name,
      address: "서울 성동구 아차산로 8",
      lat: 37.5445,
      lng: 127.0559,
    })
    .returning({ id: places.id });

  if (!place) throw new Error("장소 픽스처 생성 실패");
  return place.id;
}

async function createPin(roomId: string, name: string): Promise<string> {
  const placeId = await createPlace(name);
  const [pin] = await db
    .insert(pins)
    .values({ roomId, placeId, createdBy: ownerId })
    .returning({ id: pins.id });

  if (!pin) throw new Error("핀 픽스처 생성 실패");
  return pin.id;
}

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    withFakeTokenVerifier(
      Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(SentryErrorReporter)
        .useValue({ report: () => undefined }),
    ),
  ));
  db = app.get(DatabaseService).db;

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        authUid: ownerAuthUid,
        nickname: "지은",
        avatar: { color: "red" },
      },
      { authUid: memberAuthUid, nickname: "민호", avatar: null },
      { authUid: outsiderAuthUid, nickname: "외부인" },
      { authUid: departedAuthUid, nickname: "서연", avatar: { color: "blue" } },
    ])
    .returning({ id: users.id, authUid: users.authUid });

  const userIdOf = (authUid: string): string => {
    const user = insertedUsers.find((entry) => entry.authUid === authUid);
    if (!user) throw new Error("유저 픽스처 생성 실패");
    return user.id;
  };
  ownerId = userIdOf(ownerAuthUid);
  memberId = userIdOf(memberAuthUid);
  departedId = userIdOf(departedAuthUid);

  const insertedRooms = await db
    .insert(rooms)
    .values([
      {
        ownerId,
        type: "shared",
        name: "주말 약속",
        color: "#FF6B6B",
      },
      {
        ownerId,
        type: "personal",
        name: "내 방",
        color: "#FF6B6B",
      },
      {
        ownerId,
        type: "shared",
        name: "삭제된 방",
        color: "#FF6B6B",
        deletedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ])
    .returning({ id: rooms.id, type: rooms.type, deletedAt: rooms.deletedAt });

  const roomOf = (type: "personal" | "shared", deleted: boolean): string => {
    const room = insertedRooms.find(
      (entry) => entry.type === type && (entry.deletedAt !== null) === deleted,
    );
    if (!room) throw new Error("방 픽스처 생성 실패");
    return room.id;
  };
  sharedRoomId = roomOf("shared", false);
  const personalRoomId = roomOf("personal", false);
  const deletedRoomId = roomOf("shared", true);

  await db.insert(roomMembers).values([
    { roomId: sharedRoomId, userId: ownerId },
    { roomId: sharedRoomId, userId: memberId },
    {
      roomId: sharedRoomId,
      userId: departedId,
      deletedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
    { roomId: personalRoomId, userId: ownerId },
  ]);

  sharedPinId = await createPin(sharedRoomId, "공유 핀");
  secondSharedPinId = await createPin(sharedRoomId, "다른 공유 핀");
  personalPinId = await createPin(personalRoomId, "개인 핀");
  pagedPinId = await createPin(sharedRoomId, "페이지 핀");
  deletedPinId = await createPin(sharedRoomId, "삭제된 핀");
  deletedRoomPinId = await createPin(deletedRoomId, "삭제된 방의 핀");

  await db
    .update(pins)
    .set({ deletedAt: new Date("2026-01-03T00:00:00.000Z") })
    .where(eq(pins.id, deletedPinId));

  await db.insert(pinComments).values([
    {
      pinId: pagedPinId,
      createdBy: ownerId,
      content: "첫 번째 코멘트",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    },
    {
      pinId: pagedPinId,
      createdBy: memberId,
      content: "두 번째 코멘트",
      createdAt: new Date("2026-02-02T00:00:00.000Z"),
    },
    {
      pinId: pagedPinId,
      createdBy: departedId,
      content: "세 번째 코멘트",
      createdAt: new Date("2026-02-03T00:00:00.000Z"),
    },
  ]);
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/v1/pins/:pinId/comments", () => {
  it("방 멤버가 공동방 핀에 코멘트를 작성하고 작성자 정보를 받는다", async () => {
    const response = await createComment(
      sharedPinId,
      ownerAuthUid,
      "  좋아요 😀\n  ",
    );
    const { data } = await response.json();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({
      content: "좋아요 😀",
      canDelete: true,
      author: { id: ownerId, nickname: "지은", avatar: { color: "red" } },
    });
    expect(data.updatedAt).toBeUndefined();
    expect(data.deletedAt).toBeUndefined();
    expect(data.author.userId).toBeUndefined();
    expect(new Date(data.createdAt).toISOString()).toBe(data.createdAt);
  });

  it("개인방 핀에도 코멘트를 작성할 수 있다", async () => {
    const response = await createComment(personalPinId, ownerAuthUid, "메모");

    expect(response.status).toBe(201);
  });

  it("같은 내용의 코멘트를 각각 저장한다", async () => {
    const first = await createComment(
      sharedPinId,
      ownerAuthUid,
      "또 가고 싶어요",
    );
    const second = await createComment(
      sharedPinId,
      ownerAuthUid,
      "또 가고 싶어요",
    );
    const firstData = (await first.json()).data;
    const secondData = (await second.json()).data;

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(firstData.id).not.toBe(secondData.id);
  });

  it("비멤버의 작성 요청을 막는다", async () => {
    const response = await createComment(
      sharedPinId,
      outsiderAuthUid,
      "몰래 작성",
    );

    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("NOT_ROOM_MEMBER");
  });
});

describe("GET /api/v1/pins/:pinId/comments", () => {
  it("최신 페이지를 오래된 순으로 반환하고 탈퇴 작성자 정보를 유지한다", async () => {
    const response = await api(
      `${commentPath(pagedPinId)}?page=0&pageSize=2`,
      ownerAuthUid,
    );
    const { data, pagination } = await response.json();

    expect(response.status).toBe(200);
    expect(data.map((comment: { content: string }) => comment.content)).toEqual(
      ["두 번째 코멘트", "세 번째 코멘트"],
    );
    expect(data[0]).toMatchObject({
      author: { id: memberId, nickname: "민호", avatar: null },
      canDelete: false,
    });
    expect(data[1]).toMatchObject({
      author: { id: departedId, nickname: "서연", avatar: { color: "blue" } },
      canDelete: false,
    });
    expect(pagination).toEqual({ page: 0, pageSize: 2, hasNext: true });
  });

  it("다음 페이지에 더 오래된 코멘트를 반환하고 범위를 넘으면 빈 목록을 반환한다", async () => {
    const olderResponse = await api(
      `${commentPath(pagedPinId)}?page=1&pageSize=2`,
      ownerAuthUid,
    );
    const emptyResponse = await api(
      `${commentPath(pagedPinId)}?page=100&pageSize=2`,
      ownerAuthUid,
    );

    expect(await olderResponse.json()).toEqual({
      data: [
        expect.objectContaining({ content: "첫 번째 코멘트", canDelete: true }),
      ],
      pagination: { page: 1, pageSize: 2, hasNext: false },
    });
    expect(await emptyResponse.json()).toEqual({
      data: [],
      pagination: { page: 100, pageSize: 2, hasNext: false },
    });
  });

  it("삭제된 핀과 삭제된 방의 핀에는 접근할 수 없다", async () => {
    const deletedPinResponse = await api(
      commentPath(deletedPinId),
      ownerAuthUid,
    );
    const deletedRoomResponse = await api(
      commentPath(deletedRoomPinId),
      ownerAuthUid,
    );

    expect(deletedPinResponse.status).toBe(404);
    expect((await deletedPinResponse.json()).errorCode).toBe("PIN_NOT_FOUND");
    expect(deletedRoomResponse.status).toBe(404);
    expect((await deletedRoomResponse.json()).errorCode).toBe("PIN_NOT_FOUND");
  });

  it("비멤버의 조회 요청을 막는다", async () => {
    const response = await api(commentPath(sharedPinId), outsiderAuthUid);

    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("NOT_ROOM_MEMBER");
  });
});

describe("DELETE /api/v1/pins/:pinId/comments/:commentId", () => {
  it("작성자가 코멘트를 삭제하면 목록에서 제외한다", async () => {
    const created = await createComment(
      sharedPinId,
      ownerAuthUid,
      "삭제할 코멘트",
    );
    const { data: comment } = await created.json();
    const deleted = await api(
      `${commentPath(sharedPinId)}/${comment.id}`,
      ownerAuthUid,
      {
        method: "DELETE",
      },
    );
    const listed = await api(commentPath(sharedPinId), ownerAuthUid);

    expect(deleted.status).toBe(200);
    expect((await deleted.json()).data).toEqual({ ok: true });
    expect((await listed.json()).data).not.toContainEqual(
      expect.objectContaining({ id: comment.id }),
    );
  });

  it("다른 작성자의 코멘트 삭제와 다른 핀의 코멘트 삭제를 막는다", async () => {
    const created = await createComment(
      sharedPinId,
      ownerAuthUid,
      "작성자 전용",
    );
    const { data: comment } = await created.json();
    const forbidden = await api(
      `${commentPath(sharedPinId)}/${comment.id}`,
      memberAuthUid,
      {
        method: "DELETE",
      },
    );
    const wrongPin = await api(
      `${commentPath(secondSharedPinId)}/${comment.id}`,
      ownerAuthUid,
      { method: "DELETE" },
    );

    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).errorCode).toBe("COMMENT_DELETE_FORBIDDEN");
    expect(wrongPin.status).toBe(404);
    expect((await wrongPin.json()).errorCode).toBe("COMMENT_NOT_FOUND");
  });

  it("이미 삭제한 코멘트는 다시 삭제할 수 없다", async () => {
    const created = await createComment(
      sharedPinId,
      ownerAuthUid,
      "한 번만 삭제",
    );
    const { data: comment } = await created.json();
    await api(`${commentPath(sharedPinId)}/${comment.id}`, ownerAuthUid, {
      method: "DELETE",
    });
    const repeated = await api(
      `${commentPath(sharedPinId)}/${comment.id}`,
      ownerAuthUid,
      {
        method: "DELETE",
      },
    );

    expect(repeated.status).toBe(404);
    expect((await repeated.json()).errorCode).toBe("COMMENT_NOT_FOUND");
  });

  it("비멤버의 삭제 요청과 존재하지 않는 코멘트 삭제를 막는다", async () => {
    const created = await createComment(sharedPinId, ownerAuthUid, "권한 확인");
    const { data: comment } = await created.json();
    const nonMember = await api(
      `${commentPath(sharedPinId)}/${comment.id}`,
      outsiderAuthUid,
      { method: "DELETE" },
    );
    const missing = await api(
      `${commentPath(sharedPinId)}/${randomUUID()}`,
      ownerAuthUid,
      { method: "DELETE" },
    );

    expect(nonMember.status).toBe(403);
    expect((await nonMember.json()).errorCode).toBe("NOT_ROOM_MEMBER");
    expect(missing.status).toBe(404);
    expect((await missing.json()).errorCode).toBe("COMMENT_NOT_FOUND");
  });
});

describe("코멘트 API 입력 검증", () => {
  it("잘못된 UUID와 공백만 있는 코멘트를 거절한다", async () => {
    const invalidId = await api(
      "/api/v1/pins/not-a-uuid/comments",
      ownerAuthUid,
    );
    const blankContent = await createComment(sharedPinId, ownerAuthUid, " \n ");

    expect(invalidId.status).toBe(400);
    expect((await invalidId.json()).errorCode).toBe("VALIDATION_ERROR");
    expect(blankContent.status).toBe(400);
    expect((await blankContent.json()).errorCode).toBe("VALIDATION_ERROR");
  });

  it("인증 헤더가 없으면 거절한다", async () => {
    const response = await fetch(`${baseUrl}${commentPath(sharedPinId)}`, {
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe("UNAUTHORIZED");
  });
});

it("코멘트 작성자 참조는 null을 허용하지 않는다", async () => {
  const result = await db
    .select({ id: pinComments.id })
    .from(pinComments)
    .where(
      and(eq(pinComments.pinId, sharedPinId), isNull(pinComments.createdBy)),
    );

  expect(result).toEqual([]);
});
