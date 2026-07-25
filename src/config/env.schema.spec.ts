import { describe, expect, it } from "bun:test";
import { validateEnv } from "./env.schema";

// 검증에 필요한 최소 유효 env. 개별 테스트가 필요한 값만 덮어쓴다.
const requiredEnvironment = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/team_mino",
  GOOGLE_CLOUD_PROJECT: "test-project",
  INSTAGRAM_APP_ID: "test",
  INSTAGRAM_DOC_ID: "test",
  INSTAGRAM_GRAPHQL_ENDPOINT: "https://www.instagram.com/graphql/query/",
  INSTAGRAM_USER_AGENT: "test",
  KAKAO_REST_API_KEY: "test",
  CLOUD_TASKS_INVOKER_EMAIL: "invoker@x.iam.gserviceaccount.com",
  APP_BASE_URL: "http://localhost:3000",
  CLOUD_TASKS_LOCATION: "asia-northeast3",
  CLOUD_TASKS_QUEUE: "team-mino-prod-place-extraction",
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

describe("Cloud Tasks environment", () => {
  // production 검증용: APP_BASE_URL https 강제를 확인한다.
  const productionEnvironment = {
    ...requiredEnvironment,
    NODE_ENV: "production",
    APP_BASE_URL: "https://api.team-mino.example",
  };

  it("production에서 https APP_BASE_URL은 통과한다", () => {
    expect(() => validateEnv({ ...productionEnvironment })).not.toThrow();
  });

  it("production에서 http APP_BASE_URL은 거부한다", () => {
    expect(() =>
      validateEnv({
        ...productionEnvironment,
        APP_BASE_URL: "http://api.team-mino.example",
      }),
    ).toThrow(/APP_BASE_URL/);
  });

  it("URL 형식이 아닌 APP_BASE_URL은 거부한다", () => {
    expect(() =>
      validateEnv({ ...productionEnvironment, APP_BASE_URL: "not-a-url" }),
    ).toThrow(/APP_BASE_URL/);
  });

  it("로컬(개발)에서는 http APP_BASE_URL을 허용한다", () => {
    expect(() => validateEnv(requiredEnvironment)).not.toThrow();
  });

  it("audience 미설정 시 기본값을 채운다", () => {
    expect(validateEnv(requiredEnvironment).CLOUD_TASKS_OIDC_AUDIENCE).toBe(
      "team-mino-place-extraction-worker",
    );
  });
});
