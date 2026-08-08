import { isNull } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** 프로필 아바타. id 외 표현 필드(url·color·sunglass 등)는 기획 확정에 따라 확장된다. */
export type UserAvatar = {
  id: number;
};

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    // MVP는 별도 로그인 없이 디바이스 식별자로 사용자를 구분합니다.
    deviceId: text().notNull(),
    // 공백 포함 한글/영문 2~15자, 특수문자 불가 (PR 리뷰 확정 정책)
    nickname: varchar({ length: 15 }).notNull(),
    // 프로필 아바타 객체. 확장 필드를 수용하도록 jsonb로 보관합니다.
    avatar: jsonb().$type<UserAvatar>(),
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
