import { isNull, sql } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** 프로필 아바타. color 외 표현 필드는 기획 확정에 따라 확장된다. */
export type UserAvatar = {
  color: string;
};

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    /*
     * Firebase Authentication uid. 로그인 화면 없이 익명 인증으로 발급되며,
     * 나중에 소셜 계정을 연결(link)해도 값이 유지되므로 기존 데이터를 승계한다.
     */
    authUid: text().notNull(),
    // 공백 포함 한글/영문 2~15자, 특수문자 불가 (PR 리뷰 확정 정책)
    nickname: varchar({ length: 15 }).notNull(),
    // 프로필 아바타 객체. 확장 필드를 수용하도록 jsonb로 보관합니다.
    avatar: jsonb().$type<UserAvatar>(),
    fcmToken: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    // soft delete 시각. NULL이면 활성 레코드입니다.
    deletedAt: timestamp({ withTimezone: true }),
  },
  // 탈퇴 행이 auth_uid를 계속 점유하면 같은 계정으로 재가입할 수 없으므로,
  // 살아있는 행끼리만 유니크하도록 부분 인덱스를 씁니다.
  (t) => [
    uniqueIndex("users_auth_uid_active_unique")
      .on(t.authUid)
      .where(isNull(t.deletedAt)),
    uniqueIndex("users_fcm_token_active_unique")
      .on(t.fcmToken)
      .where(sql`${t.fcmToken} is not null and ${t.deletedAt} is null`),
  ],
);
