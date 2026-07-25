import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "../user/user.schema";

export const ROOM_TYPES = ["personal", "shared"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const rooms = pgTable("rooms", {
  id: uuid().primaryKey().defaultRandom(),
  ownerId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // personal: 개인방, shared: 공용방
  type: varchar({ length: 16 }).$type<RoomType>().notNull(),
  name: varchar({ length: 20 }).notNull(),
  description: text(),
  // 팔레트 5색 중 하나의 hex 값 (예: "#FF6B6B")
  color: varchar({ length: 7 }).notNull(),
  // 초대 링크(ssokpin.app/r/{code})의 code 부분
  inviteCode: varchar({ length: 16 }).notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
