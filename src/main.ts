import * as Sentry from "@sentry/bun";
import { loadSecretEnv } from "./config/secret-env";
import { SENTRY_FLUSH_TIMEOUT_MS } from "./config/sentry.config";

async function main(): Promise<void> {
  await loadSecretEnv();
  await import("./instrument");
  const { bootstrap } = await import("./bootstrap");
  await bootstrap();
}

main().catch(async (error: unknown) => {
  const captured =
    error instanceof Error ? error : new Error("Non-Error bootstrap failure");
  process.stderr.write("Application startup failed\n");
  Sentry.captureException(captured);
  await Sentry.flush(SENTRY_FLUSH_TIMEOUT_MS).then(
    () => undefined,
    () => undefined,
  );
  process.exitCode = 1;
});
