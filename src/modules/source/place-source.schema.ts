import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { places } from "../place/place.schema";
import { sources } from "./source.schema";

export const placeSources = pgTable(
  "place_sources",
  {
    id: uuid().primaryKey().defaultRandom(),
    placeId: uuid()
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    sourceId: uuid()
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.placeId, t.sourceId)],
);
