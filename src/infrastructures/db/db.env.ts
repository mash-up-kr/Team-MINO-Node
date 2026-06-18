/**
 * 서버가 접근할 Postgres 스키마(환경 분리용)를 결정합니다.
 *
 * 하나의 Supabase 인스턴스 안에서 `production` / `develop` 스키마로 환경을 가릅니다.
 * 선택 기준은 `DATABASE_SCHEMA` 하나뿐입니다(NODE_ENV에 의존하지 않음).
 * - `DATABASE_SCHEMA === 'production'` → `production`
 * - 그 외(미설정 포함) → 안전한 기본값 `develop`
 *
 * 운영 환경에서만 `DATABASE_SCHEMA=production`을 명시적으로 주입합니다.
 * 반환값이 항상 두 리터럴 중 하나로 고정되므로 search_path/연결 문자열에
 * 끼워 넣어도 인젝션 위험이 없습니다.
 *
 * 런타임(DatabaseService)·drizzle.config(마이그레이션)·스크립트에서 공통으로 사용합니다.
 */
export type DbSchema = "develop" | "production";

export function resolveDbSchema(value?: string | null): DbSchema {
  return value === "production" ? "production" : "develop";
}
