import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { PlaceMatch } from "./place.type";

/*
 * pgEnum 대신 text + CHECK을 쓴다. drizzle-kit이 enum 타입을 public 스키마에 고정 생성하는데,
 * 이 repo는 search_path를 환경 스키마(develop/production)로만 잡아 참조가 깨지고,
 * 같은 DB의 두 번째 환경 스키마 마이그레이션에서 CREATE TYPE이 중복 실패한다.
 */
export const PLACE_JOB_STATUSES = [
  "pending",
  "processing",
  "succeeded",
  "failed",
] as const;

export type PlaceJobStatus = (typeof PLACE_JOB_STATUSES)[number];

export const placeJobs = pgTable(
  "place_jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    url: text().notNull(),
    /*
     * 게시글 단위 dedup 키. 재사용 가능(pending/processing/succeeded) job은 shortcode당
     * 하나만 존재하도록 아래 partial unique index가 강제한다. 같은 게시글 재요청 시
     * 진행 중이면 그 job을, 성공했으면 캐시된 결과를 그대로 돌려주고, failed일 때만 새 job을 허용한다.
     * succeeded 캐시는 만료 없이 영구 재사용한다(제품 결정) — 게시글이 수정돼도 최초 추출
     * 결과를 유지하며, 강제 재추출 경로는 의도적으로 두지 않는다.
     */
    shortcode: text().notNull(),
    status: text().$type<PlaceJobStatus>().notNull().default("pending"),
    /*
     * 워커가 이 job을 선점(claim)한 누적 횟수. Cloud Tasks 재시도 상한은 태스크 단위라
     * 유실 복구(재enqueue)로 태스크가 새로 만들어지면 초기화되는데, 이 칸이 job 전체의
     * 총 시도량을 기억해 절대 성공 못 할 job의 무한 재시도를 막는다(상한은 서비스에서 판정).
     */
    attempts: integer().notNull().default(0),
    result: jsonb().$type<PlaceMatch[]>(),
    errorCode: text(),
    errorMessage: text(),
    /*
     * 워커 선점(lease) 만료 시각. processing으로 claim할 때 채우고, 완료/재시도 복귀 시 비운다.
     * 재배달이 이 시각을 지나면 만료된 lease로 보고 다시 claim할 수 있다(중복 실행 방지 + 재시도 허용).
     */
    processingLeaseExpiresAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    check(
      "place_jobs_status_check",
      sql`${table.status} in ('pending', 'processing', 'succeeded', 'failed')`,
    ),
    /*
     * 동시 요청 레이스를 애플리케이션 조회가 아니라 DB 제약으로 막는다. failed만 제외하므로
     * 성공한 job도 dedup 대상이 되어 같은 게시글 재요청은 기존 결과를 재사용한다.
     */
    uniqueIndex("place_jobs_dedup_shortcode_idx")
      .on(table.shortcode)
      .where(sql`${table.status} in ('pending', 'processing', 'succeeded')`),
  ],
);

export type PlaceJob = typeof placeJobs.$inferSelect;
export type NewPlaceJob = typeof placeJobs.$inferInsert;
