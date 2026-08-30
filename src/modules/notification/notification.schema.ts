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

// 알림함에 행으로 남지 않고 푸시로만 존재한다(FR-019).
export const PUSH_ONLY_NOTIFICATION_TYPES = ["NEARBY_PLACE_SUMMARY"] as const;

/*
 * 클라이언트가 라우팅에 쓰는 대상 식별자. 저장 오류는 이동 대상이 없어 NULL이다.
 * 장소 상세는 pinId로 열고(핀은 장소×방 쌍), placeId는 저장된 방 조회와 폴백에 쓴다.
 */
export type NotificationPayload =
  | { placeId: string; pinId: string }
  | { roomId: string };

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
