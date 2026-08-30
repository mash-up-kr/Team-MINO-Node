import { sql } from "drizzle-orm";
import { places } from "./place.schema";

/** 지구 반지름(m). 하버사인 계산용. */
const EARTH_RADIUS_METERS = 6_371_000;

/**
 * 요청 좌표에서 places 행까지의 대권 거리(m).
 * 카드 후보 반경 필터와 핀 목록 거리순 정렬이 같은 식을 쓰므로 여기서만 정의한다.
 */
export function distanceToPlace(lat: number, lng: number) {
  // acos 인자가 부동소수 오차로 [-1, 1]을 벗어나면 NaN/에러가 되므로 clamp한다.
  return sql`${EARTH_RADIUS_METERS} * acos(least(1, greatest(-1,
    cos(radians(${lat})) * cos(radians(${places.lat}))
      * cos(radians(${places.lng}) - radians(${lng}))
    + sin(radians(${lat})) * sin(radians(${places.lat}))
  )))`;
}
