import { defineConfig } from "drizzle-kit";
import { resolveDbSchema } from "./src/infrastructures/db/db.env";

/**
 * drizzle-kit 설정. 마이그레이션 생성/적용 시 사용합니다.
 *
 *   bun run db:schema-init  # 환경 스키마(CREATE SCHEMA) 준비 — 최초 1회
 *   bun run db:generate     # 스키마 변경 → 마이그레이션 SQL 생성
 *   bun run db:migrate      # 마이그레이션 적용
 *   bun run db:studio       # 로컬 DB 브라우저
 *
 * 환경별 스키마 분리(production / develop):
 * - 테이블 DDL은 스키마 이름 없이 생성 → 마이그레이션 기록을 하나로 유지.
 * - 적용 시 바라볼 스키마(search_path)를 지정해 그 스키마에 테이블이 생깁니다.
 * - 적용 기록 테이블(__drizzle_migrations)도 환경 스키마별로 따로 둡니다(migrations.schema).
 *   → dev/prod가 같은 기록을 공유해 한쪽만 반영되는 문제 방지.
 *
 * 마이그레이션은 세션 모드 연결(DATABASE_URL_DIRECT, 5432)이 필요합니다.
 * 트랜잭션 풀러(6543)는 락/멀티스테이트먼트 DDL에서 깨질 수 있어 폴백하지 않고 막습니다.
 */
const baseUrl = process.env.DATABASE_URL_DIRECT;
if (!baseUrl) {
  throw new Error(
    "DATABASE_URL_DIRECT is required for migrations (Supabase session pooler, port 5432).",
  );
}

const schema = resolveDbSchema(process.env.DATABASE_SCHEMA);
// 마이그레이션이 해당 스키마에 적용되도록, 접속 시 바라볼 스키마(search_path)를 지정.
const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}options=-csearch_path%3D${schema}`;

export default defineConfig({
  dialect: "postgresql",
  // 테이블 스키마는 각 모듈의 *.schema.ts에 위치합니다 (예: src/modules/user/user.schema.ts).
  schema: "./src/modules/**/*.schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  casing: "snake_case",
  schemaFilter: [schema],
  migrations: { schema },
});
