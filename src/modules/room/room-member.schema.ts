import { isNull } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../user/user.schema";
import { rooms } from "./room.schema";

export const roomMembers = pgTable(
  "room_members",
  {
    id: uuid().primaryKey().defaultRandom(),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "no action" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "no action" }),
    joinedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    // soft delete 시각. 방을 나간 시점이기도 합니다.
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // 나갔던 방에 다시 들어올 수 있어야 하므로 살아있는 행끼리만 유니크
    uniqueIndex("room_members_room_id_user_id_active_unique")
      .on(t.roomId, t.userId)
      .where(isNull(t.deletedAt)),
    index().on(t.userId),
  ],
);
