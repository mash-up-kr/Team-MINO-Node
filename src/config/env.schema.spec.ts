import { describe, expect, it } from "bun:test";
import { validateEnv } from "./env.schema";

// 검증에 필요한 최소 유효 env. 개별 테스트가 필요한 값만 덮어쓴다.
const requiredEnvironment = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/team_mino",
  GOOGLE_CLOUD_PROJECT: "test-project",
  INSTAGRAM_DOC_ID: "test",
  KAKAO_REST_API_KEY: "test",
  CLOUD_TASKS_INVOKER_EMAIL: "invoker@x.iam.gserviceaccount.com",
  APP_BASE_URL: "http://localhost:3000",
  CLOUD_TASKS_LOCATION: "asia-northeast3",
  CLOUD_TASKS_QUEUE: "team-mino-prod-place-extraction",
};

describe("GCS 버킷 환경변수", () => {
  it("미지정이면 undefined로 두어 APP_ENV가 버킷을 유도하게 한다", () => {
    expect(
      validateEnv(requiredEnvironment).GCS_PLACE_IMAGES_BUCKET,
    ).toBeUndefined();
  });

  it("빈 문자열을 거부한다", () => {
    // ""는 ?? 기본값으로 걸러지지 않아 gs:///... 형태로 조용히 실패한다.
    expect(() =>
      validateEnv({ ...requiredEnvironment, GCS_PLACE_IMAGES_BUCKET: "" }),
    ).toThrow("Invalid environment variables");
  });
});

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
    APP_ENV: "prod",
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

  it("기본 Cloud Tasks 모드는 cloud다", () => {
    expect(validateEnv(requiredEnvironment).CLOUD_TASKS_MODE).toBe("cloud");
  });

  it("로컬에서는 CLOUD_TASKS_MODE=local을 허용한다", () => {
    expect(
      validateEnv({ ...requiredEnvironment, CLOUD_TASKS_MODE: "local" })
        .CLOUD_TASKS_MODE,
    ).toBe("local");
  });

  it("production에서는 CLOUD_TASKS_MODE=local을 거부한다", () => {
    expect(() =>
      validateEnv({ ...productionEnvironment, CLOUD_TASKS_MODE: "local" }),
    ).toThrow(/CLOUD_TASKS_MODE/);
  });

  it("APP_ENV=prod이면 NODE_ENV 누락도 fail closed 한다", () => {
    expect(() =>
      validateEnv({
        ...requiredEnvironment,
        APP_ENV: "prod",
        CLOUD_TASKS_MODE: "local",
      }),
    ).toThrow(/APP_ENV=prod/);
  });
});
