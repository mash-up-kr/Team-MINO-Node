import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  // MVP는 별도 로그인 없이 디바이스 식별자로 사용자를 구분합니다.
  deviceId: text().notNull().unique(),
  nickname: varchar({ length: 10 }).notNull(),
  profileImageUrl: text(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
