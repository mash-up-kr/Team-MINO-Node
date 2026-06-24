import { describe, expect, it } from "bun:test";
import { runStartup } from "./startup";

describe("runStartup", () => {
  it("Secret Manager 환경을 읽은 뒤 Sentry와 애플리케이션을 순서대로 시작한다", async () => {
    const calls: string[] = [];

    await runStartup({
      initializeMonitoring: async () => {
        calls.push("monitoring");
      },
      launchApplication: async () => {
        calls.push("application");
      },
      loadEnvironment: async () => {
        calls.push("environment");
      },
    });

    expect(calls).toEqual(["environment", "monitoring", "application"]);
  });

  it("환경 로드 실패 시 Sentry와 애플리케이션을 시작하지 않는다", async () => {
    const calls: string[] = [];

    await expect(
      runStartup({
        initializeMonitoring: async () => {
          calls.push("monitoring");
        },
        launchApplication: async () => {
          calls.push("application");
        },
        loadEnvironment: async () => {
          throw new Error("secret manager unavailable");
        },
      }),
    ).rejects.toThrow("secret manager unavailable");
    expect(calls).toEqual([]);
  });
});
