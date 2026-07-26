import { isNull } from "drizzle-orm";
import {
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const PLACE_PROVIDERS = ["kakao", "google"] as const;
export type PlaceProvider = (typeof PLACE_PROVIDERS)[number];

export const places = pgTable(
  "places",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: varchar({ length: 16 }).$type<PlaceProvider>().notNull(),
    providerPlaceId: varchar({ length: 128 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    address: text().notNull(),
    // 예: 서울특별시 — 카카오 응답에 구조화된 지역 필드가 없어 추출 방식 확정 전까지 nullable
    city: varchar({ length: 32 }),
    // 예: 서초구
    district: varchar({ length: 32 }),
    lat: numeric({ mode: "number", precision: 10, scale: 7 }).notNull(),
    lng: numeric({ mode: "number", precision: 10, scale: 7 }).notNull(),
    category: varchar({ length: 64 }),
    phone: varchar({ length: 32 }),
    externalUrl: text(),
    images: jsonb().$type<string[]>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    // soft delete 시각. NULL이면 활성 레코드입니다.
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // 같은 provider 장소가 다시 유입될 때의 dedup 키.
    // 삭제된 행이 키를 점유해 재유입을 막지 않도록 살아있는 행끼리만 유니크합니다.
    uniqueIndex("places_provider_provider_place_id_active_unique")
      .on(t.provider, t.providerPlaceId)
      .where(isNull(t.deletedAt)),
  ],
);
