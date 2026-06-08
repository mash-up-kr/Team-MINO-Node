import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  // 테이블 스키마는 각 모듈의 *.schema.ts에 위치합니다.
  schema: "./src/modules/**/*.schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
