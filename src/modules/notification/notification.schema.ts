import {
  index,
  pgTable,
  text,
  timestamp,
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

// 발송 시점에 완성한 표시용 문구를 그대로 저장한다. 대상 엔티티를 조인해 다시
// 조립하지 않으므로, 알림 유형이 새 종류의 대상을 가리키게 되어도 컬럼을 늘릴 필요가 없다.
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
    url: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.recipientId, t.createdAt)],
);
