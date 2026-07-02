import * as Sentry from "@sentry/bun";
import { loadSecretEnv } from "./config/secret-env";

async function main(): Promise<void> {
  // AppModule import 시점에 ConfigModule이 validateEnv를 돌리므로, 그 전에 env를
  // 주입해야 합니다. loadSecretEnv() 이후 instrument/AppModule을 동적 import.
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
  await Sentry.flush(2_000).then(
    () => undefined,
    () => undefined,
  );
  process.exitCode = 1;
});
