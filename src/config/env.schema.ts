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
  SENTRY_DSN: v.optional(v.pipe(v.string(), v.url(), v.regex(/^https:\/\//))),
  SENTRY_RELEASE: v.optional(v.pipe(v.string(), v.minLength(1))),
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
