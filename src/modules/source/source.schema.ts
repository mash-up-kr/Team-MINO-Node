import { isNull } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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

export const sources = pgTable(
  "sources",
  {
    id: uuid().primaryKey().defaultRandom(),
    type: varchar({ length: 16 }).$type<SourceType>().notNull(),
    // 정규화된 원본 링크. 같은 링크 재유입 시 조회 키로 사용합니다.
    originalUrl: text().notNull(),
    // 스크랩 원문(캡션·이미지 등)
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    // soft delete 시각. NULL이면 활성 레코드입니다.
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // 삭제된 행이 링크를 점유해 재유입을 막지 않도록 살아있는 행끼리만 유니크
    uniqueIndex("sources_original_url_active_unique")
      .on(t.originalUrl)
      .where(isNull(t.deletedAt)),
  ],
);
