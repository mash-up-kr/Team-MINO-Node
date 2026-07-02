import * as v from "valibot";

const envSchema = v.object({
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
  DATABASE_SCHEMA: v.optional(v.picklist(["develop", "production"]), "develop"),
  DB_POOL_SIZE: v.optional(
    v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(1)),
    "5",
  ),
  // GCP 프로젝트 ID(Vertex project 겸 Maps X-Goog-User-Project)
  GOOGLE_CLOUD_PROJECT: v.optional(v.string()),
  // Gemini 3.x는 global 전용이므로 기본 "global" 사용
  GOOGLE_VERTEX_LOCATION: v.optional(v.string(), "global"),
  KAKAO_REST_API_KEY: v.optional(v.string()),
  // Cloud Tasks가 워커(/internal/*) 호출 시 쓰는 SA 이메일. OIDC 토큰의 email 클레임과 대조.
  CLOUD_TASKS_INVOKER_EMAIL: v.pipe(v.string(), v.minLength(1)),
  // 태스크 생성 시 oidcToken.audience로 지정하는 고정 문자열. 요청 URL 재구성에 기대지 않기 위함.
  CLOUD_TASKS_OIDC_AUDIENCE: v.optional(
    v.string(),
    "team-mino-place-extraction-worker",
  ),
  // 이 Cloud Run 서비스 자기 자신의 공개 URL. Cloud Tasks가 워커를 호출할 타겟 베이스.
  // 첫 배포 후 Pulumi output(serviceUrl)을 그대로 Secret Manager에 채워 넣는다.
  APP_BASE_URL: v.pipe(v.string(), v.minLength(1), v.url()),
  // infra/src/resources/tasks.ts의 placeExtractionQueue와 값을 맞춰야 한다.
  CLOUD_TASKS_LOCATION: v.pipe(v.string(), v.minLength(1)),
  CLOUD_TASKS_QUEUE: v.pipe(v.string(), v.minLength(1)),
});

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
