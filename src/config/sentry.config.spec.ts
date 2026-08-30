import { describe, expect, it, jest } from "bun:test";
import { createSentryOptions, initializeSentry } from "./sentry.config";

describe("Sentry configuration", () => {
  it("DSN이 없으면 SDK를 초기화하지 않는다", () => {
    const init = jest.fn();

    initializeSentry({ NODE_ENV: "test" }, init);

    expect(init).not.toHaveBeenCalled();
  });

  it("수동 수집 전용 옵션으로 초기화한다", () => {
    const init = jest.fn();

    initializeSentry(
      {
        NODE_ENV: "production",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        SENTRY_RELEASE: "abc123",
      },
      init,
    );

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultIntegrations: false,
        dsn: "https://public@example.ingest.sentry.io/1",
        environment: "production",
        release: "abc123",
        sendDefaultPii: false,
        serverName: "team-mino-api",
      }),
    );
  });

  it("cause 체인을 따라가도록 LinkedErrors 통합을 켠다", () => {
    const options = createSentryOptions({
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    });

    expect(options?.integrations).toEqual([
      expect.objectContaining({ name: "LinkedErrors" }),
    ]);
  });

  it("빈 release로 초기화하지 않는다", () => {
    expect(() =>
      createSentryOptions({
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        SENTRY_RELEASE: " ",
      }),
    ).toThrow("SENTRY_RELEASE must not be blank");
  });
});
