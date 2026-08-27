/**
 * 디자인 확정 색상 팔레트 키(총 13색, kebab-case). 방 색상과 아바타 색상이
 * 공유하며, 실제 색 매핑(그라데이션 등)은 클라이언트가 담당한다.
 * grey는 개인방 기본값이다. (#71)
 */
export const COLOR_KEYS = [
  "red",
  "red-orange",
  "orange",
  "lime",
  "green",
  "cyan",
  "violet",
  "pink",
  "blue",
  "brown",
  "light-blue",
  "purple",
  "grey",
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];
