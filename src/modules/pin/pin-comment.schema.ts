import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../user/user.schema";
import { pins } from "./pin.schema";

export const pinComments = pgTable("pin_comments", {
  id: uuid().primaryKey().defaultRandom(),
  pinId: uuid()
    .notNull()
    .references(() => pins.id, { onDelete: "cascade" }),
  // 작성자. 방 멤버 여부는 애플리케이션 레벨에서 검증합니다.
  // 탈퇴 시에도 댓글은 보존하고 작성자만 비웁니다.
  createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  content: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
