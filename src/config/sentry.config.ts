import type { BunOptions, ErrorEvent } from "@sentry/bun";

const SAFE_ERROR_MESSAGE = "Internal server error" as const;

export type SentryEnvironment = {
  readonly NODE_ENV?: string;
  readonly SENTRY_DSN?: string;
  readonly SENTRY_RELEASE?: string;
};

type Initialize = (options: BunOptions) => unknown;

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  const {
    breadcrumbs: _breadcrumbs,
    contexts: _contexts,
    extra: _extra,
    request: _request,
    transaction: _transaction,
    user: _user,
    ...safeEvent
  } = event;

  return {
    ...safeEvent,
    exception: event.exception
      ? {
          ...event.exception,
          values: event.exception.values?.map((value) => ({
            ...value,
            value: SAFE_ERROR_MESSAGE,
            stacktrace: value.stacktrace
              ? {
                  ...value.stacktrace,
                  frames: value.stacktrace.frames?.map((frame) => {
                    const {
                      context_line: _contextLine,
                      post_context: _postContext,
                      pre_context: _preContext,
                      vars: _vars,
                      ...safeFrame
                    } = frame;
                    return safeFrame;
                  }),
                }
              : undefined,
          })),
        }
      : undefined,
    message: event.message ? SAFE_ERROR_MESSAGE : undefined,
  };
}

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
    beforeSend: sanitizeSentryEvent,
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
