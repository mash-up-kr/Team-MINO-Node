import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { PlaceCandidate } from "./place.type";

export const placeJobStatus = pgEnum("place_job_status", [
  "pending",
  "processing",
  "succeeded",
  "failed",
]);

export const placeJobs = pgTable(
  "place_jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    url: text().notNull(),
    // 게시글 단위 dedup 키. shortcode + status 조합으로 "진행 중인 job 재사용" 여부를 조회한다.
    // TODO(PR29 머지 후): shortcode 추출 로직 연결하고 notNull로 되돌리기.
    shortcode: text(),
    status: placeJobStatus().notNull().default("pending"),
    result: jsonb().$type<PlaceCandidate[]>(),
    errorCode: text(),
    errorMessage: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [index("place_jobs_shortcode_idx").on(table.shortcode)],
);

export type PlaceJob = typeof placeJobs.$inferSelect;
export type NewPlaceJob = typeof placeJobs.$inferInsert;
