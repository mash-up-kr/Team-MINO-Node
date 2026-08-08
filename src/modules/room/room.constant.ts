import { rooms } from "./room.schema";

/**
 * 방 응답에 노출하는 컬럼 집합. drizzle은 entity 클래스 없이 테이블
 * 정의가 곧 스키마라, 내부 컬럼(deleted_at·invite_code 등)이 응답에 새지
 * 않도록 select 대상 컬럼을 상수로 고정한다.
 * invite_code는 초대 기획 TBD로 발급·노출하지 않는다.
 */
export const ROOM_COLUMNS = {
  id: rooms.id,
  type: rooms.type,
  name: rooms.name,
  description: rooms.description,
  color: rooms.color,
  ownerId: rooms.ownerId,
  createdAt: rooms.createdAt,
};
