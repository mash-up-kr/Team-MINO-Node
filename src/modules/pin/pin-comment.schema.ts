import { isNull } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { type UserAvatar, users } from "../user/user.schema";
import { pins } from "./pin.schema";

export const pinComments = pgTable(
  "pin_comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    pinId: uuid()
      .notNull()
      .references(() => pins.id, { onDelete: "no action" }),
    // 작성자. 방 멤버 여부는 애플리케이션 레벨에서 검증합니다.
    // 탈퇴해도 참조를 유지합니다. 표시 방식은 애플리케이션에서 결정합니다.
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "no action" }),
    content: text().notNull(),
    // 작성 시점의 작성자 프로필 스냅샷 (QA 스펙 EC-016: 작성 당시로 표시).
    // 이후 닉네임·아바타가 바뀌어도 과거 코멘트는 이 값으로 보인다.
    authorNickname: varchar({ length: 15 }),
    authorAvatar: jsonb().$type<UserAvatar>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    // soft delete 시각. NULL이면 활성 레코드입니다.
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // 활성 코멘트 조회 및 개수 집계용 부분 인덱스
    index().on(t.pinId).where(isNull(t.deletedAt)),
    index().on(t.createdBy),
  ],
);
