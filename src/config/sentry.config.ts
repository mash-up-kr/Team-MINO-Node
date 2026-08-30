import {
  type BunOptions,
  linkedErrorsIntegration,
  type init as SentryInit,
} from "@sentry/bun";

export type SentryEnvironment = {
  readonly NODE_ENV?: string;
  readonly SENTRY_DSN?: string;
  readonly SENTRY_RELEASE?: string;
};

export const SENTRY_FLUSH_TIMEOUT_MS = 2_000 as const;

/** cause 체인을 몇 단계까지 따라갈지. 워커 래핑은 1단계라 여유 있게 잡는다. */
const LINKED_ERRORS_LIMIT = 5;

export function createSentryOptions(
  environment: SentryEnvironment,
): BunOptions | undefined {
  const dsn = environment.SENTRY_DSN?.trim();
  if (!dsn) {
    return undefined;
  }

  const parsedDsn = new URL(dsn);
  if (parsedDsn.protocol !== "https:") {
    throw new TypeError("SENTRY_DSN must use HTTPS");
  }
  const release = environment.SENTRY_RELEASE?.trim();
  if (environment.SENTRY_RELEASE !== undefined && !release) {
    throw new TypeError("SENTRY_RELEASE must not be blank");
  }

  return {
    /*
     * 기본 통합은 전부 끄고(수동 수집 전용) cause 체인 추적만 되살린다.
     * place worker는 원본 오류를 ServiceUnavailableException으로 감싸 던지므로,
     * 이 통합이 없으면 래퍼만 올라오고 진짜 원인(DB 연결 끊김 등)은 유실된다.
     */
    defaultIntegrations: false,
    integrations: [linkedErrorsIntegration({ limit: LINKED_ERRORS_LIMIT })],
    dsn,
    environment: environment.NODE_ENV ?? "development",
    release,
    sendDefaultPii: false,
    serverName: "team-mino-api",
  };
}

export function initializeSentry(
  environment: SentryEnvironment,
  init: typeof SentryInit,
): void {
  const options = createSentryOptions(environment);
  if (options) {
    init(options);
  }
}
