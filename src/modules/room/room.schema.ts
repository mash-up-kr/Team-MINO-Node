import { isNull } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
    // 팔레트 5색 중 하나의 hex 값 (예: "#FF6B6B")
    color: varchar({ length: 7 }).notNull(),
    // 초대 링크(ssokpin.app/r/{code})의 code 부분
    inviteCode: varchar({ length: 16 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    // soft delete 시각. NULL이면 활성 레코드입니다.
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // 삭제된 방이 초대 코드를 계속 점유하지 않도록 살아있는 행끼리만 유니크
    uniqueIndex("rooms_invite_code_active_unique")
      .on(t.inviteCode)
      .where(isNull(t.deletedAt)),
    index().on(t.ownerId),
  ],
);
