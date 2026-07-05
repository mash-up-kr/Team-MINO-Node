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
  KAKAO_REST_API_KEY: v.pipe(v.string(), v.minLength(1)),
  // Instagram 비공개 GraphQL 호출용 값들. 인스타가 토큰/구조를 바꾸면 env만 갱신하면 됨.
  INSTAGRAM_GRAPHQL_ENDPOINT: v.pipe(
    v.string(),
    v.url(),
    v.startsWith("https://"),
  ),
  INSTAGRAM_DOC_ID: v.pipe(v.string(), v.minLength(1)),
  INSTAGRAM_LSD: v.pipe(v.string(), v.minLength(1)),
  INSTAGRAM_APP_ID: v.pipe(v.string(), v.minLength(1)),
  INSTAGRAM_USER_AGENT: v.pipe(v.string(), v.minLength(1)),
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
