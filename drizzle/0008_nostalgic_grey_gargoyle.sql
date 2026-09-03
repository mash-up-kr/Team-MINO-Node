ALTER TABLE "places" ADD COLUMN "category_group" varchar(16) DEFAULT 'other' NOT NULL;--> statement-breakpoint
-- 기존 행 backfill. 분류 규칙은 src/modules/place/place.util.ts의 classifyPlaceCategory와
-- 동일해야 하며, 카페를 먼저 판정하는 순서까지 같다("음식점 > 카페 > ..." 계층 때문).
-- 규칙을 바꾸면 이 UPDATE를 다시 돌리는 마이그레이션이 필요하다.
UPDATE "places" SET "category_group" = CASE
  WHEN "category" IS NULL THEN 'other'
  WHEN lower("category") LIKE ANY (ARRAY['%카페%','%cafe%','%디저트%','%베이커리%','%bakery%']) THEN 'cafe'
  WHEN lower("category") LIKE ANY (ARRAY['%음식점%','%식당%','%restaurant%','%한식%','%일식%','%중식%','%양식%','%분식%','%술집%','%호프%','%포차%','%주점%','%요리%','%구이%']) THEN 'restaurant'
  ELSE 'other'
END;
