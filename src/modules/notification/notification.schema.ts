import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { places } from "../place/place.schema";
import { rooms } from "../room/room.schema";
import { users } from "../user/user.schema";

export const NOTIFICATION_TYPES = [
  "PIN_DUPLICATED",
  "SAVE_FAILED",
  "NEARBY_PLACE",
  "TOP_COMMENTED_PLACE",
  "ROOM_MEMBER_JOINED",
  "ROOM_JOINED_SELF",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    recipientId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "no action" }),
    type: varchar({ length: 32 }).$type<NotificationType>().notNull(),
    // 장소·방 대상 타입에서만 채운다.
    placeId: uuid().references(() => places.id, { onDelete: "no action" }),
    roomId: uuid().references(() => rooms.id, { onDelete: "no action" }),
    // 문구에 다른 유저가 등장하는 타입(ROOM_MEMBER_JOINED)에서만 채운다.
    actorId: uuid().references(() => users.id, { onDelete: "no action" }),
    // 재전달·재실행에도 같은 사건이 중복 기록되지 않게 막는 키. 없으면 매번 새 행.
    dedupKey: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("notifications_type_dedup_key_active_unique")
      .on(t.type, t.dedupKey)
      .where(sql`${t.dedupKey} is not null and ${t.deletedAt} is null`),
    index().on(t.recipientId, t.createdAt),
  ],
);
