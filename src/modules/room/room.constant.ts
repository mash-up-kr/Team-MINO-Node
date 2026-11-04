import type { ColorKey } from "../../common/colors/color.constant";

/** 온보딩 시 자동 생성되는 개인방 표시명. */
export const PERSONAL_ROOM_NAME = "내 장소";

/** 방 목록 썸네일에 담는 최근 핀 이미지 최대 개수. */
export const ROOM_THUMBNAIL_COUNT = 4;

/**
 * 개인방 기본 색상 — 팔레트 키 gray (디자인 확정).
 * 클라이언트는 개인방 기본 썸네일을 회색 이미지로 렌더링한다.
 */
export const PERSONAL_ROOM_DEFAULT_COLOR: ColorKey = "gray";

/**
 * 공동방 색상 미선택 시 기본값 — 팔레트 키 gray.
 * QA 스펙 FR-006/TS-007: 대표 색상을 고르지 않으면 회색이 적용된다.
 * POST /api/v1/rooms의 color는 생략 가능하며, 생략 시 이 값으로 저장된다.
 */
export const SHARED_ROOM_DEFAULT_COLOR: ColorKey = "gray";
