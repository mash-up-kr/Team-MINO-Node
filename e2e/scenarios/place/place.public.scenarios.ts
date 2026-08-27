import { expect, it } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { sources } from "../../../src/modules/source/source.schema";
import { NORMALIZED_POST_URL, PlaceE2eHarness } from "./place.e2e.helpers";

export function registerPublicPlaceScenarios(harness: PlaceE2eHarness): void {
  it("멤버십을 먼저 확인하고 source를 재사용하며 exact task payload를 enqueue한다", async () => {
    const first = await harness.postPin();
    const second = await harness.postPin();
    const firstBody = await first.json();
    const body = await second.json();

    expect(first.status).toBe(202);
    expect(firstBody).toEqual({ data: { ok: true } });
    expect(body).toEqual({ data: { ok: true } });
    expect(second.status).toBe(202);
    expect(harness.enqueuePinExtraction).toHaveBeenCalledTimes(2);
    expect(harness.task).toMatchObject({
      roomId: harness.room,
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
    });
    const second = await harness.postPin(harness.memberAuthUid, {
      url: "https://instagram.com/p/e2e-pin/?igsh=another",
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

  it("잘못된 URL은 400이고 enqueue하지 않는다", async () => {
    const response = await harness.postPin(harness.memberAuthUid, {
      url: "not-a-url",
    });

    expect(response.status).toBe(400);
    expect(harness.enqueuePinExtraction).not.toHaveBeenCalled();
  });

  it("evil query-domain과 notinstagram/profile URL은 source write 전에 400이다", async () => {
    const invalidUrls = [
      "https://evil.com/?next=instagram.com/p/abc123",
      "https://notinstagram.com/p/abc123",
      "https://www.instagram.com/profile",
      "https://user:pass@instagram.com/p/abc123",
      "https://instagram.com:8443/p/abc123",
    ];

    for (const url of invalidUrls) {
      const response = await harness.postPin(harness.memberAuthUid, { url });
      expect(response.status).toBe(400);
    }
    expect(harness.enqueuePinExtraction).not.toHaveBeenCalled();
    expect(await harness.db.select().from(sources)).toHaveLength(0);
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
