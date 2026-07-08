import { describe, expect, it, jest } from "bun:test";
import { flushSentryOnShutdown } from "./sentry-lifecycle.service";

describe("SentryLifecycleService", () => {
  it("종료 시 2초 제한으로 flush한다", async () => {
    const flush = jest.fn().mockResolvedValue(true);

    await flushSentryOnShutdown(flush);

    expect(flush).toHaveBeenCalledWith(2_000);
  });

  it.each([
    false,
    new Error("network failure"),
  ])("flush 실패가 애플리케이션 종료를 막지 않는다", async (result) => {
    const flush =
      result instanceof Error
        ? jest.fn().mockRejectedValue(result)
        : jest.fn().mockResolvedValue(result);

    await expect(flushSentryOnShutdown(flush)).resolves.toBeUndefined();
  });
});
