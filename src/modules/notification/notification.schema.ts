import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
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

// 클라이언트가 라우팅에 쓰는 대상 식별자. 저장 오류는 이동 대상이 없어 NULL이다.
export type NotificationPayload = { placeId: string } | { roomId: string };

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    recipientId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "no action" }),
    type: varchar({ length: 32 }).$type<NotificationType>().notNull(),
    typeLabel: text().notNull(),
    targetName: text().notNull(),
    thumbnailUrl: text(),
    payload: jsonb().$type<NotificationPayload>(),
    key: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index().on(t.recipientId, t.createdAt),
    uniqueIndex("notifications_recipient_key_unique")
      .on(t.recipientId, t.key)
      .where(sql`${t.key} is not null and ${t.deletedAt} is null`),
  ],
);
