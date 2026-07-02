import type { BunOptions } from "@sentry/bun";

export type SentryEnvironment = {
  readonly NODE_ENV?: string;
  readonly SENTRY_DSN?: string;
  readonly SENTRY_RELEASE?: string;
};

type Initialize = (options: BunOptions) => unknown;

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
    dsn,
    environment: environment.NODE_ENV ?? "development",
    release,
    sendDefaultPii: false,
    serverName: "team-mino-api",
  };
}

export function initializeSentry(
  environment: SentryEnvironment,
  init: Initialize,
): void {
  const options = createSentryOptions(environment);
  if (options) {
    init(options);
  }
}
