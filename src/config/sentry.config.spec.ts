import { describe, expect, it, jest } from "bun:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { defaultStackParser, type ErrorEvent, NodeClient } from "@sentry/bun";
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

  it("래핑된 예외의 cause를 이벤트 예외 체인에 붙인다", () => {
    const options = createSentryOptions({
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    });
    const client = {
      getOptions: () => ({ stackParser: defaultStackParser }),
    } as unknown as NodeClient;
    // place worker가 재시도 대상 오류를 감쌀 때와 같은 형태를 재현한다.
    const rootCause = new Error("write CONNECTION_ENDED db.example:5432");
    const wrapper = new ServiceUnavailableException(
      "장소 추출 작업을 재시도합니다.",
      { cause: rootCause },
    );
    const event = {
      exception: {
        values: [
          { type: "ServiceUnavailableException", value: wrapper.message },
        ],
      },
    } as ErrorEvent;

    const integrations = options?.integrations;
    const [linkedErrors] = Array.isArray(integrations) ? integrations : [];
    expect(linkedErrors?.preprocessEvent).toBeDefined();
    linkedErrors?.preprocessEvent?.(
      event,
      { originalException: wrapper },
      client,
    );

    expect(
      event.exception?.values?.map((value) => [value.type, value.value]),
    ).toEqual([
      ["Error", "write CONNECTION_ENDED db.example:5432"],
      ["ServiceUnavailableException", "장소 추출 작업을 재시도합니다."],
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
