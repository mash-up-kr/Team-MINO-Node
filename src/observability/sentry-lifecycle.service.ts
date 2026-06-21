import type { OnApplicationShutdown } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/bun";

const FLUSH_TIMEOUT_MS = 2_000 as const;
type Flush = (timeout: number) => PromiseLike<boolean>;

export async function flushSentryOnShutdown(
  flush: Flush = Sentry.flush,
): Promise<void> {
  await flush(FLUSH_TIMEOUT_MS).then(
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
