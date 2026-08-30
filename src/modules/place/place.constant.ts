/**
 * 카테고리 그룹 분류 키워드. provider가 준 원본 문자열(`places.category`)에
 * 부분 일치하면 해당 그룹으로 본다. 비교는 소문자로 정규화한 뒤 수행하므로
 * 영문 키워드는 소문자로 적는다.
 *
 * 카카오는 "음식점 > 카페 > 커피전문점"처럼 계층을 한 문자열로 주기 때문에
 * 카페도 "음식점"을 포함한다. 그래서 분류는 카페를 먼저 판정한다
 * (classifyPlaceCategory 참고).
 */
export const CAFE_CATEGORY_KEYWORDS = [
  "카페",
  "cafe",
  "디저트",
  "베이커리",
  "bakery",
] as const;

export const RESTAURANT_CATEGORY_KEYWORDS = [
  "음식점",
  "식당",
  "restaurant",
  "한식",
  "일식",
  "중식",
  "양식",
  "분식",
  "술집",
  "호프",
  "포차",
  "주점",
  "요리",
  "구이",
] as const;
