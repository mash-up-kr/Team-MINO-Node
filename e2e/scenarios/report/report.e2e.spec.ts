import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { SentryErrorReporter } from "../../../src/infrastructures/sentry/sentry-reporter";
import { pins } from "../../../src/modules/pin/pin.schema";
import { pinComments } from "../../../src/modules/pin/pin-comment.schema";
import { places } from "../../../src/modules/place/place.schema";
import { reports } from "../../../src/modules/report/report.schema";
import { REPORT_DAILY_LIMIT } from "../../../src/modules/report/report.service";
import { rooms } from "../../../src/modules/room/room.schema";
import { users } from "../../../src/modules/user/user.schema";
import { authHeaders, withFakeTokenVerifier } from "../../auth";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;
let db: DatabaseService["db"];

const reporterAuthUid = `e2e-report-reporter-${randomUUID()}`;
const targetAuthUid = `e2e-report-target-${randomUUID()}`;
const rateAuthUid = `e2e-report-rate-${randomUUID()}`;
const burstAuthUid = `e2e-report-burst-${randomUUID()}`;

let reporterId: string;
let targetId: string;
let rateReporterId: string;
let pinId: string;
let commentId: string;
let deletedCommentId: string;

function api(
  path: string,
  authUid: string | null,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(authUid ? authHeaders(authUid) : {}),
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function postReport(
  authUid: string | null,
  body: Record<string, unknown>,
): Promise<Response> {
  return api("/api/v1/reports", authUid, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function reportRow(id: string) {
  const [row] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1);
  return row;
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
      { authUid: reporterAuthUid, nickname: "신고자" },
      { authUid: targetAuthUid, nickname: "피신고자" },
      { authUid: rateAuthUid, nickname: "도배자" },
      { authUid: burstAuthUid, nickname: "버스터" },
    ])
    .returning({ id: users.id, authUid: users.authUid });
  const userIdOf = (authUid: string): string => {
    const user = insertedUsers.find((entry) => entry.authUid === authUid);
    if (!user) throw new Error("유저 픽스처 생성 실패");
    return user.id;
  };
  reporterId = userIdOf(reporterAuthUid);
  targetId = userIdOf(targetAuthUid);
  rateReporterId = userIdOf(rateAuthUid);

  const [place] = await db
    .insert(places)
    .values({
      provider: "kakao",
      providerPlaceId: `report-place-${randomUUID()}`,
      name: "신고 테스트 장소",
      address: "서울 성동구 아차산로 8",
      lat: 37.5445,
      lng: 127.0559,
    })
    .returning({ id: places.id });
  if (!place) throw new Error("장소 픽스처 생성 실패");

  const [room] = await db
    .insert(rooms)
    .values({ ownerId: targetId, type: "shared", name: "신고방", color: "red" })
    .returning({ id: rooms.id });
  if (!room) throw new Error("방 픽스처 생성 실패");

  const [pin] = await db
    .insert(pins)
    .values({ roomId: room.id, placeId: place.id, createdBy: targetId })
    .returning({ id: pins.id });
  if (!pin) throw new Error("핀 픽스처 생성 실패");
  pinId = pin.id;

  const [comment] = await db
    .insert(pinComments)
    .values({ pinId, createdBy: targetId, content: "신고당할 코멘트" })
    .returning({ id: pinComments.id });
  if (!comment) throw new Error("코멘트 픽스처 생성 실패");
  commentId = comment.id;

  const [deletedComment] = await db
    .insert(pinComments)
    .values({
      pinId,
      createdBy: targetId,
      content: "지워진 증거 코멘트",
      deletedAt: new Date("2026-03-01T00:00:00.000Z"),
    })
    .returning({ id: pinComments.id });
  if (!deletedComment) throw new Error("삭제 코멘트 픽스처 생성 실패");
  deletedCommentId = deletedComment.id;
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/v1/reports", () => {
  it("유저 신고를 접수하고 201과 스냅샷을 남긴다", async () => {
    const res = await postReport(reporterAuthUid, {
      targetType: "user",
      targetId,
      reason: "HARASSMENT",
      detail: "욕설을 합니다",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; status: string; createdAt: string };
    };
    expect(body.data.status).toBe("pending");
    expect(typeof body.data.createdAt).toBe("string");

    const row = await reportRow(body.data.id);
    expect(row?.reporterId).toBe(reporterId);
    expect(row?.targetSnapshot).toMatchObject({ nickname: "피신고자" });
  });

  it("코멘트 신고에 본문 스냅샷을 남긴다", async () => {
    const res = await postReport(reporterAuthUid, {
      targetType: "pin_comment",
      targetId: commentId,
      reason: "SPAM",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; status: string };
    };
    const row = await reportRow(body.data.id);
    expect(row?.targetSnapshot).toMatchObject({
      content: "신고당할 코멘트",
      pinId,
    });
  });

  it("핀 신고에 방·장소 스냅샷을 남긴다", async () => {
    const res = await postReport(reporterAuthUid, {
      targetType: "pin",
      targetId: pinId,
      reason: "SEXUAL",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; status: string };
    };
    const row = await reportRow(body.data.id);
    expect(row?.targetSnapshot).toHaveProperty("roomId");
    expect(row?.targetSnapshot).toHaveProperty("placeId");
  });

  it("존재하지 않는 타겟도 접수한다 (유저 열거 방지)", async () => {
    const res = await postReport(reporterAuthUid, {
      targetType: "pin",
      targetId: randomUUID(),
      reason: "OTHER",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; status: string };
    };
    const row = await reportRow(body.data.id);
    expect(row?.targetSnapshot).toBeNull();
  });

  it("같은 타겟 중복 신고는 409를 돌려준다", async () => {
    const payload = {
      targetType: "user",
      targetId,
      reason: "SPAM",
    };

    const res = await postReport(reporterAuthUid, payload);

    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      errorCode: string;
    };
    expect(body.errorCode).toBe("REPORT_ALREADY_EXISTS");
  });

  it("자기 자신 신고는 400으로 거절한다", async () => {
    const res = await postReport(reporterAuthUid, {
      targetType: "user",
      targetId: reporterId,
      reason: "SPAM",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      errorCode: string;
    };
    expect(body.errorCode).toBe("SELF_REPORT_NOT_ALLOWED");
  });

  it("미인증 요청은 401로 거절한다", async () => {
    const res = await postReport(null, {
      targetType: "user",
      targetId,
      reason: "SPAM",
    });

    expect(res.status).toBe(401);
  });

  it("알 수 없는 사유는 400으로 거절한다", async () => {
    const res = await postReport(reporterAuthUid, {
      targetType: "user",
      targetId,
      reason: "ANNOYING",
    });

    expect(res.status).toBe(400);
  });

  it("500자를 넘는 detail은 400으로 거절한다", async () => {
    const res = await postReport(reporterAuthUid, {
      targetType: "user",
      targetId: randomUUID(),
      reason: "OTHER",
      detail: "가".repeat(501),
    });

    expect(res.status).toBe(400);
  });

  it("24시간 한도를 넘기면 429로 거절한다", async () => {
    let lastStatus = 0;
    for (let i = 0; i < REPORT_DAILY_LIMIT + 1; i += 1) {
      const res = await postReport(rateAuthUid, {
        targetType: "pin",
        targetId: randomUUID(),
        reason: "SPAM",
      });
      lastStatus = res.status;
      await res.text();
    }

    expect(lastStatus).toBe(429);

    const res = await postReport(rateAuthUid, {
      targetType: "pin",
      targetId: randomUUID(),
      reason: "SPAM",
    });
    const body = (await res.json()) as { errorCode: string };
    expect(res.status).toBe(429);
    expect(body.errorCode).toBe("REPORT_RATE_LIMITED");
  });

  it("지워진 코멘트도 본문 스냅샷을 박제한다", async () => {
    const res = await postReport(reporterAuthUid, {
      targetType: "pin_comment",
      targetId: deletedCommentId,
      reason: "HARASSMENT",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; status: string };
    };
    const row = await reportRow(body.data.id);
    expect(row?.targetSnapshot).toMatchObject({
      content: "지워진 증거 코멘트",
      pinId,
    });
  });

  it("자기 코멘트 신고는 400으로 거절한다", async () => {
    const [mine] = await db
      .insert(pinComments)
      .values({ pinId, createdBy: reporterId, content: "내 코멘트" })
      .returning({ id: pinComments.id });
    if (!mine) throw new Error("내 코멘트 픽스처 생성 실패");

    const res = await postReport(reporterAuthUid, {
      targetType: "pin_comment",
      targetId: mine.id,
      reason: "SPAM",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("SELF_REPORT_NOT_ALLOWED");
  });

  it("한도가 찬 유저의 자기신고도 400으로 끝난다 (429 아님)", async () => {
    const [mine] = await db
      .insert(pinComments)
      .values({
        pinId,
        createdBy: rateReporterId,
        content: "한도 찬 유저의 코멘트",
      })
      .returning({ id: pinComments.id });
    if (!mine) throw new Error("한도 찬 유저 코멘트 픽스처 생성 실패");

    const res = await postReport(rateAuthUid, {
      targetType: "pin_comment",
      targetId: mine.id,
      reason: "SPAM",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("SELF_REPORT_NOT_ALLOWED");
  });

  it("소문자 사유는 400으로 거절한다", async () => {
    const res = await postReport(reporterAuthUid, {
      targetType: "pin",
      targetId: randomUUID(),
      reason: "spam",
    });

    expect(res.status).toBe(400);
  });

  it("동시 중복 신고는 201 하나와 409 하나로 끝난다", async () => {
    const target = randomUUID();
    const payload = {
      targetType: "pin",
      targetId: target,
      reason: "SPAM",
    };

    const [first, second] = await Promise.all([
      postReport(reporterAuthUid, payload),
      postReport(reporterAuthUid, payload),
    ]);
    await first.text();
    await second.text();

    expect([first.status, second.status].sort()).toEqual([201, 409]);
  });

  it("병렬 버스트에서도 24시간 한도가 지켜진다", async () => {
    const results = await Promise.all(
      Array.from({ length: REPORT_DAILY_LIMIT + 10 }, (_, i) =>
        postReport(burstAuthUid, {
          targetType: "pin",
          targetId: randomUUID(),
          reason: "SPAM",
          detail: `burst-${i}`,
        }),
      ),
    );
    await Promise.all(results.map((res) => res.text()));
    const statuses = results.map((res) => res.status).sort();

    expect(statuses.filter((status) => status === 201)).toHaveLength(
      REPORT_DAILY_LIMIT,
    );
    expect(statuses.filter((status) => status === 429)).toHaveLength(10);
  });
});
