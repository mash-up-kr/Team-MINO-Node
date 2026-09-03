import {
  CAFE_CATEGORY_KEYWORDS,
  RESTAURANT_CATEGORY_KEYWORDS,
} from "./place.constant";
import type { PlaceCategoryGroup } from "./place.schema";

/**
 * provider 카테고리 원본 문자열을 그룹으로 분류한다. 장소를 저장하는 시점에
 * 한 번 계산해 `places.category_group`에 넣고, 조회는 그 컬럼을 그대로 비교한다.
 *
 * 카페를 먼저 판정하는 이유: 카카오 카테고리는 "음식점 > 카페 > 커피전문점"처럼
 * 계층 전체가 한 문자열이라 카페도 "음식점"에 걸린다. 순서가 곧 우선순위다.
 */
export function classifyPlaceCategory(
  category: string | null | undefined,
): PlaceCategoryGroup {
  if (!category) {
    return "other";
  }
  const normalized = category.toLowerCase();
  if (CAFE_CATEGORY_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "cafe";
  }
  if (
    RESTAURANT_CATEGORY_KEYWORDS.some((keyword) => normalized.includes(keyword))
  ) {
    return "restaurant";
  }
  return "other";
}
