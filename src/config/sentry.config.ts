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
    defaultIntegrations: false,
    // 워커가 원본 오류를 ServiceUnavailableException으로 감싸 던진다. cause 체인을
    // 따라가지 않으면 래퍼만 올라오고 진짜 원인(DB 연결 끊김 등)이 유실된다.
    integrations: [linkedErrorsIntegration()],
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
