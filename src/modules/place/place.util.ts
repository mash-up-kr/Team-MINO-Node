import type { GeoCandidate } from "../../infrastructures/geocoder/geocoder.type";
import {
  CAFE_CATEGORY_KEYWORDS,
  NON_PLACE_CATEGORY_KEYWORDS,
  NON_PLACE_NAME_PATTERN,
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

/**
 * AI가 지명을 장소로 추출하면 geocoder 최상위 후보로 지도 핀이 오염된다
 * ("역곡역" 저장 시 "역곡북부역사거리"가 핀으로 저장된 실제 사례). 이런 후보는
 * 랭킹 이전에 제외한다. 판정은 1) 카테고리 키워드, 2) 카테고리가 없을 때만
 * 이름 끝 패턴 순서로 한다.
 */
export function isNonPlaceCandidate(
  candidate: Pick<GeoCandidate, "category" | "placeName">,
): boolean {
  if (candidate.category) {
    const normalized = candidate.category.toLowerCase();
    return NON_PLACE_CATEGORY_KEYWORDS.some((keyword) =>
      normalized.includes(keyword),
    );
  }
  return NON_PLACE_NAME_PATTERN.test(candidate.placeName.trim());
}
