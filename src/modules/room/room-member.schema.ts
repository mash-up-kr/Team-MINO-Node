import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "../user/user.schema";
import { rooms } from "./room.schema";

export const roomMembers = pgTable(
  "room_members",
  {
    id: uuid().primaryKey().defaultRandom(),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.roomId, t.userId)],
);
