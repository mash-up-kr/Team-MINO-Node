import type { BunOptions } from "@sentry/bun";
import * as v from "valibot";
import { createSentryOptions } from "../src/config/sentry.config";

const verificationEnvironmentSchema = v.object({
  NODE_ENV: v.literal("production"),
  SENTRY_DSN: v.pipe(v.string(), v.url(), v.regex(/^https:\/\//)),
  SENTRY_RELEASE: v.pipe(v.string(), v.minLength(1)),
  SENTRY_VERIFY_MARKER: v.pipe(v.string(), v.minLength(1)),
});

type VerificationEnvironment = v.InferOutput<
  typeof verificationEnvironmentSchema
>;

type VerificationScope = {
  setFingerprint(fingerprint: readonly string[]): unknown;
  setTag(key: string, value: string): unknown;
};

export type VerificationClient = {
  captureException(exception: Error): unknown;
  flush(timeout: number): PromiseLike<boolean>;
  init(options: BunOptions): unknown;
  withScope(callback: (scope: VerificationScope) => void): unknown;
};

class SentryVerificationError extends Error {
  constructor() {
    super("Sentry verification event");
    this.name = "SentryVerificationError";
  }
}

export async function runSentryVerification(
  rawEnvironment: Record<string, string | undefined>,
  client: VerificationClient,
): Promise<0 | 1> {
  try {
    const parsed = v.safeParse(verificationEnvironmentSchema, rawEnvironment);
    if (!parsed.success) {
      return 1;
    }

    const environment: VerificationEnvironment = parsed.output;
    const options = createSentryOptions(environment);
    if (!options) {
      return 1;
    }

    client.init(options);
    client.withScope((scope) => {
      scope.setFingerprint([environment.SENTRY_VERIFY_MARKER]);
      scope.setTag("sentry.verify.marker", environment.SENTRY_VERIFY_MARKER);
      client.captureException(new SentryVerificationError());
    });

    return (await client.flush(2_000)) ? 0 : 1;
  } catch {
    return 1;
  }
}
