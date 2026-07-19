import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const SOURCE_TYPES = [
  "instagram",
  "naver_map",
  "google_map",
  "manual",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const sources = pgTable("sources", {
  id: uuid().primaryKey().defaultRandom(),
  type: varchar({ length: 16 }).$type<SourceType>().notNull(),
  // 정규화된 원본 링크. 같은 링크 재유입 시 조회 키로 사용합니다.
  originalUrl: text().notNull().unique(),
  // 스크랩 원문(캡션·이미지 등)
  metadata: jsonb().$type<Record<string, unknown>>(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
