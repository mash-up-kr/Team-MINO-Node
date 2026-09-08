import { isNull } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { places } from "../place/place.schema";
import { rooms } from "../room/room.schema";
import { sources } from "../source/source.schema";
import { users } from "../user/user.schema";

export const pins = pgTable(
  "pins",
  {
    id: uuid().primaryKey().defaultRandom(),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "no action" }),
    placeId: uuid()
      .notNull()
      .references(() => places.id, { onDelete: "no action" }),
    // 링크 없이 직접 저장한 핀은 출처가 없을 수 있습니다.
    sourceId: uuid().references(() => sources.id, { onDelete: "set null" }),
    // 탈퇴해도 참조를 유지합니다. 표시 방식은 애플리케이션에서 결정합니다.
    createdBy: uuid().references(() => users.id, { onDelete: "no action" }),
    /*
     * 이 핀이 만들어진 게시물의 이미지 공개 URL(표시 순서대로).
     *
     * 장소가 아니라 핀에 둔다. places는 실제 장소 단위라 여러 게시물이 같은 행을
     * 공유하고, 그러면 나중에 저장한 사람의 사진이 먼저 저장한 사람의 썸네일을
     * 덮어쓴다. 이미지는 "그 게시물"의 것이므로 게시물×방 단위인 핀에 속한다.
     */
    images: jsonb().$type<string[]>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    // 그룹방 내에서 누군가 마지막으로 본 시점 (사용자별 아님)
    lastAccessedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    // soft delete 시각. NULL이면 활성 레코드입니다.
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // 같은 방에 같은 장소 중복 핀 방지.
    // 삭제한 핀을 다시 꽂을 수 있어야 하므로 살아있는 행끼리만 유니크합니다.
    uniqueIndex("pins_room_id_place_id_active_unique")
      .on(t.roomId, t.placeId)
      .where(isNull(t.deletedAt)),
    index().on(t.placeId),
    index().on(t.sourceId),
    index().on(t.createdBy),
  ],
);
