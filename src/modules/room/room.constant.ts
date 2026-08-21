/** 온보딩 시 자동 생성되는 개인방 표시명. */
export const PERSONAL_ROOM_NAME = "내 방";

/**
 * 개인방 기본 색상. 색상은 서버가 hex를 내려주지 않고 enum 키로만 관리하며,
 * 실제 색(투명도·그라데이션 포함) 매핑은 클라이언트가 담당한다(리뷰 방향 픽스).
 * 키셋은 디자인 확정 전이라 rooms.color(varchar(7)) 안에 드는
 * 임시 기본 키 "black"을 쓴다.
 */
export const PERSONAL_ROOM_DEFAULT_COLOR = "black";
