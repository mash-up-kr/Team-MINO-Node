import { describe, expect, it, jest } from "bun:test";
import type { ErrorEvent } from "@sentry/bun";
import {
  createSentryOptions,
  initializeSentry,
  sanitizeSentryEvent,
} from "./sentry.config";

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

  it("빈 release로 초기화하지 않는다", () => {
    expect(() =>
      createSentryOptions({
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        SENTRY_RELEASE: " ",
      }),
    ).toThrow("SENTRY_RELEASE must not be blank");
  });

  it("이벤트의 요청 정보와 원문 오류 메시지를 제거한다", () => {
    const event: ErrorEvent = {
      type: undefined,
      breadcrumbs: [{ message: "cookie-secret" }],
      contexts: { runtime: { token: "context-secret" } },
      exception: {
        values: [
          {
            type: "Error",
            value: "user@example.com token=query-secret",
            stacktrace: { frames: [{ filename: "src/example.ts", lineno: 7 }] },
          },
        ],
      },
      extra: { body: "body-secret" },
      message: "postgres://user:password@127.0.0.9/database",
      request: {
        cookies: { session: "cookie-secret" },
        headers: { authorization: "authorization-secret" },
        url: "https://example.com/path?token=query-secret",
      },
      transaction: "/users/private-id",
      user: { email: "user@example.com", ip_address: "127.0.0.9" },
    };

    const sanitized = sanitizeSentryEvent(event);
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain("authorization-secret");
    expect(serialized).not.toContain("cookie-secret");
    expect(serialized).not.toContain("body-secret");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("127.0.0.9");
    expect(serialized).not.toContain("query-secret");
    expect(serialized).not.toContain("password");
    expect(sanitized.exception?.values?.[0]?.value).toBe(
      "Internal server error",
    );
    expect(
      sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename,
    ).toBe("src/example.ts");
  });

  it("옵션 builder에도 동일한 scrubber를 연결한다", () => {
    const options = createSentryOptions({
      NODE_ENV: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    });

    expect(options?.beforeSend).toBe(sanitizeSentryEvent);
  });
});
