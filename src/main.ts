import * as Sentry from "@sentry/bun";
import { loadSecretEnv } from "./config/secret-env";
import { runStartup } from "./startup";

runStartup({
  initializeMonitoring: async () => {
    await import("./instrument");
  },
  launchApplication: async () => {
    const { bootstrap } = await import("./bootstrap");
    await bootstrap();
  },
  loadEnvironment: loadSecretEnv,
}).catch(async (error: unknown) => {
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
