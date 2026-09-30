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

/**
 * 지명성 후보(역·사거리·주차장 등)를 걸러내는 카테고리 키워드.
 * 카카오 category_name은 "교통,수송 > 지하철,전철 > 수도권6호선"처럼 계층 전체가
 * 한 문자열로 오므로 부분 일치로 판정한다(isNonPlaceCandidate 참고).
 *
 * 실제 운영 데이터에서 확인된 오염 사례가 판정 기준이다: "대흥역 6호선",
 * "역곡북부역사거리", "송림식당길 노상공영주차장" 등은 모두 "교통,수송" 대분류였다.
 * 음식점·카페는 이 대분류에 속하지 않으므로 false positive 걱정 없이 전면 차단한다.
 */
export const NON_PLACE_CATEGORY_KEYWORDS = [
  "교통,수송",
  "transit",
  "train station",
  "subway station",
  "parking",
] as const;

/**
 * 카테고리가 없는 후보를 위한 이름 패턴 보조 장치. 카카오는 category_name을
 * 항상 주지만, provider별로 빠질 수 있어 이름 끝 패턴으로 한 번 더 걸러낸다.
 * 카테고리가 실제 장소(음식점 등)를 가리키면 이름을 보지 않는다 — "정류장" 같은
 * 가게 이름이 오분류되지 않게 하기 위해서다.
 */
export const NON_PLACE_NAME_PATTERN =
  /(?:지하철역|전철역|기차역|역|호선|사거리|교차로|정류장|주차장|요금소|톨게이트|휴게소)$/u;

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
