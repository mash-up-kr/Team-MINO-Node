import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { places } from "../place/place.schema";
import { rooms } from "../room/room.schema";
import { sources } from "../source/source.schema";
import { users } from "../user/user.schema";

export const pins = pgTable("pins", {
  id: uuid().primaryKey().defaultRandom(),
  roomId: uuid()
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  placeId: uuid()
    .notNull()
    .references(() => places.id),
  // 링크 없이 직접 저장한 핀은 출처가 없을 수 있습니다.
  sourceId: uuid().references(() => sources.id, { onDelete: "set null" }),
  createdBy: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  lastAccessedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
