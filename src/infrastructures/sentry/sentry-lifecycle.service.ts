import type { OnApplicationShutdown } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/bun";
import { SENTRY_FLUSH_TIMEOUT_MS } from "../../config/sentry.config";

type Flush = (timeout: number) => PromiseLike<boolean>;

export async function flushSentryOnShutdown(
  flush: Flush = Sentry.flush,
): Promise<void> {
  await flush(SENTRY_FLUSH_TIMEOUT_MS).then(
    () => undefined,
    () => undefined,
  );
}

@Injectable()
export class SentryLifecycleService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await flushSentryOnShutdown();
  }
}
