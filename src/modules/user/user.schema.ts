import { isNull } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    // MVP는 별도 로그인 없이 디바이스 식별자로 사용자를 구분합니다.
    deviceId: text().notNull(),
    nickname: varchar({ length: 10 }).notNull(),
    profileImageUrl: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    // soft delete 시각. NULL이면 활성 레코드입니다.
    deletedAt: timestamp({ withTimezone: true }),
  },
  // 탈퇴 행이 device_id를 계속 점유하면 같은 기기로 재가입할 수 없으므로,
  // 살아있는 행끼리만 유니크하도록 부분 인덱스를 씁니다.
  (t) => [
    uniqueIndex("users_device_id_active_unique")
      .on(t.deviceId)
      .where(isNull(t.deletedAt)),
  ],
);
