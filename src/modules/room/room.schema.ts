import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "../user/user.schema";

export const ROOM_TYPES = ["personal", "shared"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const rooms = pgTable(
  "rooms",
  {
    id: uuid().primaryKey().defaultRandom(),
    // 삭제는 soft delete로만 이뤄지므로 DB 레벨 전파는 없습니다.
    // 방장 탈퇴 시 위임은 애플리케이션에서 처리합니다.
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "no action" }),
    // personal: 개인방, shared: 공용방
    type: varchar({ length: 16 }).$type<RoomType>().notNull(),
    name: varchar({ length: 20 }).notNull(),
    description: text(),
    // 색상 enum 키(예: "black"). 실제 색 매핑은 클라이언트 담당, 키셋은 디자인 확정 전
    color: varchar({ length: 7 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    // soft delete 시각. NULL이면 활성 레코드입니다.
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.ownerId)],
);
