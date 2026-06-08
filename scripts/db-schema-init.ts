#!/usr/bin/env bun

/**
 * 환경 스키마(production / develop)를 준비합니다. 최초 1회 또는 신규 환경 추가 시 실행.
 * drizzle-kit은 스키마를 자동 생성하지 않으므로, 마이그레이션 전에 먼저 실행해야 합니다.
 *
 *   bun run db:schema-init                       # DATABASE_SCHEMA(기본 develop) 스키마 생성
 *   DATABASE_SCHEMA=production bun run db:schema-init
 */
import postgres from "postgres";
import { resolveDbSchema } from "../src/infrastructures/db/db.env";

async function main() {
  const url = process.env.DATABASE_URL_DIRECT;
  if (!url) {
    console.error(
      "DATABASE_URL_DIRECT 환경변수가 설정되지 않았습니다 (마이그레이션용 세션 풀러 5432 URL).",
    );
    process.exit(1);
  }

  // resolveDbSchema 반환값은 develop/production 두 리터럴로 고정되어 인젝션 위험이 없습니다.
  const schema = resolveDbSchema(process.env.DATABASE_SCHEMA);
  const sql = postgres(url, { max: 1 });

  try {
    await sql.unsafe(`create schema if not exists "${schema}"`);
    console.log(`✅ 스키마 준비 완료: "${schema}"`);
  } catch (e) {
    console.error("스키마 생성 실패:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
