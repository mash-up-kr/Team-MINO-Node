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
 * 연결은 런타임과 동일한 DATABASE_URL(Direct connection 또는 session pooler)을 씁니다.
 * 둘 다 세션 단위 연결이라 락/멀티스테이트먼트 DDL이 안전합니다.
 * (트랜잭션 풀러 6543은 마이그레이션에 부적합하므로 사용하지 않습니다.)
 */
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error("DATABASE_URL is required for migrations.");
}

const schema = resolveDbSchema(process.env.DATABASE_SCHEMA);
// 마이그레이션이 해당 스키마에 적용되도록, 접속 시 바라볼 스키마(search_path)를 지정.
const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}options=-csearch_path%3D${schema}`;

export default defineConfig({
  dialect: "postgresql",
  // 테이블 스키마는 각 모듈의 *.schema.ts에 위치합니다 (예: src/modules/user/user.schema.ts).
  schema: "./src/modules/**/*.schema.ts",
  out: "./src/infrastructures/db/migrations",
  dbCredentials: { url },
  casing: "snake_case",
  schemaFilter: [schema],
  migrations: { schema },
});
