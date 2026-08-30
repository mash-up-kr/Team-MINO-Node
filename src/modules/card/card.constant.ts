/** 홈 카드 덱 1회 노출 장수. */
export const DECK_SIZE = 10;

/** 최신순 후보 기간(일). */
export const LATEST_WINDOW_DAYS = 14;

/** 가까운순 후보 반경(m). */
export const NEARBY_RADIUS_METERS = 3_000;

/** 위도 1도당 거리(m). 바운딩 박스 계산용 근사값. */
export const METERS_PER_LAT_DEGREE = 111_320;

/**
 * 가볼 만한 곳 기본 정원. 자격 조건이 없는 유일한 라벨이라, 아래 지표 라벨들이
 * 자격 미달로 남긴 자리까지 흡수해 덱이 항상 DECK_SIZE를 채우게 한다.
 */
export const WORTH_VISITING_QUOTA = 4;

/**
 * 지표 기반 라벨. 이 순서대로 정원만큼 배정하며, 앞 라벨이 가져간 장소는 제외된다.
 *
 * `min`은 라벨이 성립하기 위한 최소 지표값이다. 이게 없으면 코멘트 0인 장소가
 * 순위만으로 `이야기 많은 곳`이 되어 라벨이 사실과 어긋난다.
 */
export const METRIC_LABELS = [
  { label: "manySaves", quota: 2, min: 2 },
  { label: "manyComments", quota: 2, min: 1 },
  { label: "manyViews", quota: 2, min: 1 },
] as const;
