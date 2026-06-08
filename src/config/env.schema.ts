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
  // 마이그레이션 전용 연결(Supabase 세션 풀러 5432). 런타임엔 없어도 되므로 optional.
  DATABASE_URL_DIRECT: v.optional(v.pipe(v.string(), v.url())),
  // 접근할 스키마. 미설정 시 안전한 기본값 develop. 운영에서만 production 주입.
  DATABASE_SCHEMA: v.optional(v.picklist(["develop", "production"]), "develop"),
  DB_POOL_SIZE: v.optional(
    v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(1)),
    "5",
  ),
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
