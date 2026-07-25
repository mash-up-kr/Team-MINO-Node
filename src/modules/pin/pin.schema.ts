import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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
      .references(() => rooms.id, { onDelete: "cascade" }),
    // places는 방 간 공유 엔티티라 핀이 남아 있으면 삭제를 막습니다.
    placeId: uuid()
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    // 링크 없이 직접 저장한 핀은 출처가 없을 수 있습니다.
    sourceId: uuid().references(() => sources.id, { onDelete: "set null" }),
    // 탈퇴 시에도 방에 남긴 핀은 보존하고 작성자만 비웁니다.
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    // 그룹방 내에서 누군가 마지막으로 본 시점 (사용자별 아님)
    lastAccessedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  // 같은 방에 같은 장소 중복 핀 방지
  (t) => [unique().on(t.roomId, t.placeId)],
);
