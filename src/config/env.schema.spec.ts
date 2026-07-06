import { describe, expect, it } from "bun:test";
import { validateEnv } from "./env.schema";

const requiredEnvironment = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/team_mino",
  GOOGLE_CLOUD_PROJECT: "test-project",
  INSTAGRAM_APP_ID: "test",
  INSTAGRAM_DOC_ID: "test",
  INSTAGRAM_GRAPHQL_ENDPOINT: "https://www.instagram.com/api/graphql",
  INSTAGRAM_LSD: "test",
  INSTAGRAM_USER_AGENT: "test",
};

describe("Sentry environment", () => {
  it("Sentry 환경변수는 선택 사항이다", () => {
    expect(validateEnv(requiredEnvironment).SENTRY_DSN).toBeUndefined();
  });

  it("HTTPS DSN과 release를 파싱한다", () => {
    const result = validateEnv({
      ...requiredEnvironment,
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      SENTRY_RELEASE: "abc123",
    });

    expect(result.SENTRY_DSN).toBe("https://public@example.ingest.sentry.io/1");
    expect(result.SENTRY_RELEASE).toBe("abc123");
  });

  it.each([
    ["HTTP DSN", { SENTRY_DSN: "http://example.com/1" }],
    ["잘못된 DSN", { SENTRY_DSN: "not-a-url" }],
    ["빈 release", { SENTRY_RELEASE: "" }],
  ])("%s을 거부한다", (_name, sentryEnvironment) => {
    expect(() =>
      validateEnv({ ...requiredEnvironment, ...sentryEnvironment }),
    ).toThrow("Invalid environment variables");
  });
});
