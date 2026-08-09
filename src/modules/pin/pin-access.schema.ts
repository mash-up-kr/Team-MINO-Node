import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../user/user.schema";
import { pins } from "./pin.schema";

/**
 * 사용자별 핀 접근 로그. 접근마다 행을 추가하는 append-only 구조로,
 * 카드 재생성 시 "이미 본 카드" 제외 조건과 "친구들이 많이 본 곳"
 * 클릭수 집계의 원천을 겸합니다. 로그 성격이라 soft delete를 두지 않습니다.
 */
export const pinAccesses = pgTable(
  "pin_accesses",
  {
    id: uuid().primaryKey().defaultRandom(),
    pinId: uuid()
      .notNull()
      .references(() => pins.id, { onDelete: "no action" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "no action" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // 사용자가 이미 본 핀 조회용 (카드 제외 조건)
    index().on(t.userId, t.pinId),
    // 핀별 클릭수 집계용
    index().on(t.pinId),
  ],
);
