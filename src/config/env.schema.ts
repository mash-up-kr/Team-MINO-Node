import * as v from "valibot";

const envSchema = v.object({
  NODE_ENV: v.optional(
    v.picklist(["development", "test", "production"]),
    "development",
  ),
  PORT: v.optional(v.pipe(v.string(), v.regex(/^\d+$/)), "3000"),
  DATABASE_URL: v.pipe(v.string(), v.minLength(1), v.url()),
  DB_POOL_SIZE: v.optional(v.pipe(v.string(), v.regex(/^\d+$/)), "10"),
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
