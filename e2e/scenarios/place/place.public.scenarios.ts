import { expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { notifications } from "../../../src/modules/notification/notification.schema";
import { sources } from "../../../src/modules/source/source.schema";
import { NORMALIZED_POST_URL, PlaceE2eHarness } from "./place.e2e.helpers";

export function registerPublicPlaceScenarios(harness: PlaceE2eHarness): void {
  it("여러 방 멤버십을 먼저 확인하고 source를 재사용하며 task 하나를 enqueue한다", async () => {
    const request = {
      url: NORMALIZED_POST_URL,
      roomIds: [harness.room, harness.secondRoom],
    };
    const first = await harness.postPin(harness.memberAuthUid, request);
    const second = await harness.postPin(harness.memberAuthUid, request);
    const firstBody = await first.json();
    const body = await second.json();

    expect(first.status).toBe(202);
    expect(firstBody).toEqual({ data: { ok: true } });
    expect(body).toEqual({ data: { ok: true } });
    expect(second.status).toBe(202);
    expect(harness.enqueuePinExtraction).toHaveBeenCalledTimes(2);
    expect(harness.task).toMatchObject({
      roomIds: [harness.room, harness.secondRoom],
      createdBy: harness.member,
      url: NORMALIZED_POST_URL,
    });
    expect(
      await harness.db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(
            eq(sources.originalUrl, NORMALIZED_POST_URL),
            isNull(sources.deletedAt),
          ),
        ),
    ).toHaveLength(1);
  });

  it("tracking query와 HTTP 입력은 하나의 normalized source와 task URL을 공유한다", async () => {
    const first = await harness.postPin(harness.memberAuthUid, {
      url: "http://m.instagram.com/p/e2e-pin/?utm_source=test#fragment",
      roomIds: [harness.room],
    });
    const second = await harness.postPin(harness.memberAuthUid, {
      url: "https://instagram.com/p/e2e-pin/?igsh=another",
      roomIds: [harness.room],
    });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(harness.enqueuePinExtraction).toHaveBeenCalledTimes(2);
    expect(harness.task).toMatchObject({ url: NORMALIZED_POST_URL });
    expect(
      await harness.db
        .select({ id: sources.id, originalUrl: sources.originalUrl })
        .from(sources)
        .where(isNull(sources.deletedAt)),
    ).toEqual([{ id: expect.any(String), originalUrl: NORMALIZED_POST_URL }]);
  });

  it("비멤버는 source write와 enqueue 전에 403을 받는다", async () => {
    const response = await harness.postPin(harness.outsider);

    expect(response.status).toBe(403);
    expect(harness.enqueuePinExtraction).not.toHaveBeenCalled();
    expect(await harness.db.select().from(sources)).toHaveLength(0);
  });

  it("인스타그램 링크가 아니면 202로 접수하고 SAVE_FAILED 알림만 남긴다", async () => {
    const response = await harness.postPin(harness.memberAuthUid, {
      url: "https://www.youtube.com/watch?v=e2e",
      roomIds: [harness.room],
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { ok: true } });
    expect(harness.enqueuePinExtraction).not.toHaveBeenCalled();
    expect(await harness.db.select().from(sources)).toHaveLength(0);
    expect(
      await harness.db
        .select({ type: notifications.type })
        .from(notifications)
        .where(eq(notifications.recipientId, harness.member)),
    ).toEqual([{ type: "SAVE_FAILED" }]);
  });

  it("evil query-domain과 notinstagram/profile URL은 source write 없이 접수만 된다", async () => {
    const invalidUrls = [
      "not-a-url",
      "https://evil.com/?next=instagram.com/p/abc123",
      "https://notinstagram.com/p/abc123",
      "https://www.instagram.com/profile",
      "https://user:pass@instagram.com/p/abc123",
      "https://instagram.com:8443/p/abc123",
    ];

    for (const url of invalidUrls) {
      const response = await harness.postPin(harness.memberAuthUid, {
        url,
        roomIds: [harness.room],
      });
      expect(response.status).toBe(202);
    }
    expect(harness.enqueuePinExtraction).not.toHaveBeenCalled();
    expect(await harness.db.select().from(sources)).toHaveLength(0);
    expect(
      await harness.db
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.recipientId, harness.member)),
    ).toHaveLength(invalidUrls.length);
  });

  it("빈 링크는 400이고 enqueue하지 않는다", async () => {
    const response = await harness.postPin(harness.memberAuthUid, {
      url: "",
      roomIds: [harness.room],
    });

    expect(response.status).toBe(400);
    expect(harness.enqueuePinExtraction).not.toHaveBeenCalled();
  });

  it("빈 배열 또는 중복 방 ID는 enqueue하지 않는다", async () => {
    const empty = await harness.postPin(harness.memberAuthUid, {
      url: NORMALIZED_POST_URL,
      roomIds: [],
    });
    const duplicate = await harness.postPin(harness.memberAuthUid, {
      url: NORMALIZED_POST_URL,
      roomIds: [harness.room, harness.room],
    });

    expect(empty.status).toBe(400);
    expect(duplicate.status).toBe(400);
    expect(harness.enqueuePinExtraction).not.toHaveBeenCalled();
  });

  it("방을 11개 선택해도 멤버십 검증까지 진행한다", async () => {
    const response = await harness.postPin(harness.memberAuthUid, {
      url: NORMALIZED_POST_URL,
      roomIds: Array.from({ length: 11 }, randomUUID),
    });

    expect(response.status).toBe(403);
    expect(harness.enqueuePinExtraction).not.toHaveBeenCalled();
  });

  it("enqueue 실패는 502지만 방금 upsert한 source는 다음 요청에서 재사용된다", async () => {
    harness.enqueuePinExtraction.mockRejectedValueOnce(
      new Error("queue unavailable"),
    );

    const failed = await harness.postPin();
    const retried = await harness.postPin();

    expect(failed.status).toBe(502);
    expect(retried.status).toBe(202);
    expect(
      await harness.db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(
            eq(sources.originalUrl, NORMALIZED_POST_URL),
            isNull(sources.deletedAt),
          ),
        ),
    ).toHaveLength(1);
  });
}
