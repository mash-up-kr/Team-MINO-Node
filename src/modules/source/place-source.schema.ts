import { isNull } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { places } from "../place/place.schema";
import { sources } from "./source.schema";

export const placeSources = pgTable(
  "place_sources",
  {
    id: uuid().primaryKey().defaultRandom(),
    placeId: uuid()
      .notNull()
      .references(() => places.id, { onDelete: "no action" }),
    sourceId: uuid()
      .notNull()
      .references(() => sources.id, { onDelete: "no action" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    // soft delete 시각. NULL이면 활성 레코드입니다.
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // 끊었던 장소·출처 연결을 다시 맺을 수 있어야 하므로 살아있는 행끼리만 유니크
    uniqueIndex("place_sources_place_id_source_id_active_unique")
      .on(t.placeId, t.sourceId)
      .where(isNull(t.deletedAt)),
    index().on(t.sourceId),
  ],
);
