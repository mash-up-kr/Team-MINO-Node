import { describe, expect, it, jest } from "bun:test";
import { runSentryVerification } from "./verify-sentry-runner";

describe("Sentry verification script", () => {
  it("marker fingerprint로 한 건을 전송하고 flush한다", async () => {
    const scope = {
      setFingerprint: jest.fn(),
      setTag: jest.fn(),
    };
    const client = {
      captureException: jest.fn(),
      flush: jest.fn().mockResolvedValue(true),
      init: jest.fn(),
      withScope: jest.fn((callback: (value: typeof scope) => void) =>
        callback(scope),
      ),
    };

    const result = await runSentryVerification(
      {
        NODE_ENV: "production",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        SENTRY_RELEASE: "abc123",
        SENTRY_VERIFY_MARKER: "team-mino-sentry-qa-123",
      },
      client,
    );

    expect(result).toBe(0);
    expect(scope.setFingerprint).toHaveBeenCalledWith([
      "team-mino-sentry-qa-123",
    ]);
    expect(scope.setTag).toHaveBeenCalledWith(
      "sentry.verify.marker",
      "team-mino-sentry-qa-123",
    );
    expect(client.captureException).toHaveBeenCalledTimes(1);
    expect(client.flush).toHaveBeenCalledWith(2_000);
  });

  it.each([
    "SENTRY_DSN",
    "SENTRY_RELEASE",
    "SENTRY_VERIFY_MARKER",
  ])("%s 누락 시 전송하지 않는다", async (missing) => {
    const environment: Record<string, string> = {
      NODE_ENV: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      SENTRY_RELEASE: "abc123",
      SENTRY_VERIFY_MARKER: "team-mino-sentry-qa-123",
    };
    delete environment[missing];
    const client = {
      captureException: jest.fn(),
      flush: jest.fn().mockResolvedValue(true),
      init: jest.fn(),
      withScope: jest.fn(),
    };

    const result = await runSentryVerification(environment, client);

    expect(result).toBe(1);
    expect(client.captureException).not.toHaveBeenCalled();
  });

  it("flush 실패를 종료 코드로 반환한다", async () => {
    const scope = {
      setFingerprint: jest.fn(),
      setTag: jest.fn(),
    };
    const client = {
      captureException: jest.fn(),
      flush: jest.fn().mockResolvedValue(false),
      init: jest.fn(),
      withScope: jest.fn((callback: (value: typeof scope) => void) =>
        callback(scope),
      ),
    };

    const result = await runSentryVerification(
      {
        NODE_ENV: "production",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        SENTRY_RELEASE: "abc123",
        SENTRY_VERIFY_MARKER: "team-mino-sentry-qa-123",
      },
      client,
    );

    expect(result).toBe(1);
  });

  it("flush rejection을 종료 코드로 반환한다", async () => {
    const scope = {
      setFingerprint: jest.fn(),
      setTag: jest.fn(),
    };
    const client = {
      captureException: jest.fn(),
      flush: jest.fn().mockRejectedValue(new Error("network failure")),
      init: jest.fn(),
      withScope: jest.fn((callback: (value: typeof scope) => void) =>
        callback(scope),
      ),
    };

    const result = await runSentryVerification(
      {
        NODE_ENV: "production",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        SENTRY_RELEASE: "abc123",
        SENTRY_VERIFY_MARKER: "team-mino-sentry-qa-123",
      },
      client,
    );

    expect(result).toBe(1);
  });

  it("SDK 초기화 예외를 종료 코드로 반환한다", async () => {
    const client = {
      captureException: jest.fn(),
      flush: jest.fn().mockResolvedValue(true),
      init: jest.fn(() => {
        throw new Error("SDK initialization failed");
      }),
      withScope: jest.fn(),
    };

    const result = await runSentryVerification(
      {
        NODE_ENV: "production",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        SENTRY_RELEASE: "abc123",
        SENTRY_VERIFY_MARKER: "team-mino-sentry-qa-123",
      },
      client,
    );

    expect(result).toBe(1);
    expect(client.captureException).not.toHaveBeenCalled();
  });
});
