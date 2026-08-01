import * as v from "valibot";

const envSchema = v.pipe(
  v.object({
    // Secret Manager 선택과 런타임 역할을 구분하는 배포 환경. Cloud Run은 prod, start:local은 local을 주입한다.
    APP_ENV: v.optional(v.picklist(["local", "prod"]), "local"),
    NODE_ENV: v.optional(
      v.picklist(["development", "test", "production"]),
      "development",
    ),
    PORT: v.optional(
      v.pipe(
        v.string(),
        v.regex(/^\d+$/),
        v.transform(Number),
        v.minValue(1),
        v.maxValue(65535),
      ),
      "3000",
    ),
    DATABASE_URL: v.pipe(v.string(), v.minLength(1), v.url()),
    // 접근할 스키마. 미설정 시 안전한 기본값 develop. 운영에서만 production 주입.
    DATABASE_SCHEMA: v.optional(
      v.picklist(["develop", "production"]),
      "develop",
    ),
    DB_POOL_SIZE: v.optional(
      v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(1)),
      "5",
    ),
    // GCP 프로젝트 ID(Vertex project 겸 Maps X-Goog-User-Project)
    GOOGLE_CLOUD_PROJECT: v.pipe(v.string(), v.minLength(1)),
    // Gemini 3.x는 global 전용이므로 기본 "global" 사용
    GOOGLE_VERTEX_LOCATION: v.optional(v.string(), "global"),
    KAKAO_REST_API_KEY: v.pipe(v.string(), v.minLength(1)),
    SENTRY_DSN: v.optional(v.pipe(v.string(), v.url(), v.regex(/^https:\/\//))),
    SENTRY_RELEASE: v.optional(v.pipe(v.string(), v.minLength(1))),
    // Instagram 비공개 GraphQL 호출용 값들. 인스타가 토큰/구조를 바꾸면 env만 갱신하면 됨.
    INSTAGRAM_GRAPHQL_ENDPOINT: v.pipe(
      v.string(),
      v.url(),
      v.startsWith("https://"),
    ),
    INSTAGRAM_DOC_ID: v.pipe(v.string(), v.minLength(1)),
    INSTAGRAM_APP_ID: v.pipe(v.string(), v.minLength(1)),
    INSTAGRAM_USER_AGENT: v.pipe(v.string(), v.minLength(1)),
    // Cloud Tasks가 워커(/internal/*) 호출 시 쓰는 SA 이메일. OIDC 토큰의 email 클레임과 대조.
    CLOUD_TASKS_INVOKER_EMAIL: v.pipe(v.string(), v.minLength(1)),
    // 태스크 생성 시 oidcToken.audience로 지정하는 고정 문자열. 요청 URL 재구성에 기대지 않기 위함.
    CLOUD_TASKS_OIDC_AUDIENCE: v.optional(
      v.string(),
      "team-mino-place-extraction-worker",
    ),
    /*
     * 이 Cloud Run 서비스 자기 자신의 공개 URL. Cloud Tasks가 워커를 호출할 타겟 베이스.
     * 첫 배포 후 Pulumi output(serviceUrl)을 그대로 Secret Manager에 채워 넣는다.
     */
    APP_BASE_URL: v.pipe(v.string(), v.minLength(1), v.url()),
    // infra/src/resources/tasks.ts의 placeExtractionQueue와 값을 맞춰야 한다.
    CLOUD_TASKS_LOCATION: v.pipe(v.string(), v.minLength(1)),
    CLOUD_TASKS_QUEUE: v.pipe(v.string(), v.minLength(1)),
    /*
     * cloud: 실제 Cloud Tasks enqueue + OIDC guard.
     * local: `bun run start:local` 전용. enqueue는 no-op이고 워커 guard는 non-production에서만 우회한다.
     */
    CLOUD_TASKS_MODE: v.optional(v.picklist(["cloud", "local"]), "cloud"),
  }),
  /*
   * 운영(production)에서는 Cloud Tasks가 호출할 APP_BASE_URL이 반드시 https여야 한다.
   * 로컬/테스트는 http://localhost 를 허용한다.
   */
  v.check(
    (env) =>
      env.NODE_ENV !== "production" || env.APP_BASE_URL.startsWith("https://"),
    "APP_BASE_URL must use https in production",
  ),
  v.check(
    (env) => env.NODE_ENV !== "production" || env.CLOUD_TASKS_MODE === "cloud",
    "CLOUD_TASKS_MODE=local is not allowed in production",
  ),
  // 배포가 보장하는 APP_ENV=prod에서는 NODE_ENV 누락을 development로 묵인하지 않고 fail closed 한다.
  v.check(
    (env) =>
      env.APP_ENV !== "prod" ||
      (env.NODE_ENV === "production" && env.CLOUD_TASKS_MODE === "cloud"),
    "APP_ENV=prod requires NODE_ENV=production and CLOUD_TASKS_MODE=cloud",
  ),
);

export type Env = v.InferOutput<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = v.safeParse(envSchema, config);

  if (!result.success) {
    const messages = result.issues
      .map((issue) => {
        const path =
          issue.path?.map((item) => String(item.key)).join(".") ?? "unknown";

        return `${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid environment variables:\n${messages}`);
  }

  return result.output;
}
