export type StartupDependencies = {
  readonly initializeMonitoring: () => Promise<void>;
  readonly launchApplication: () => Promise<void>;
  readonly loadEnvironment: () => Promise<void>;
};

export async function runStartup(
  dependencies: StartupDependencies,
): Promise<void> {
  await dependencies.loadEnvironment();
  await dependencies.initializeMonitoring();
  await dependencies.launchApplication();
}
