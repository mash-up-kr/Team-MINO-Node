import { users } from "../user/user.schema";
import { pins } from "./pin.schema";

/**
 * 핀 응답에 노출하는 컬럼 집합. drizzle은 entity 클래스 없이 테이블
 * 정의가 곧 스키마라, 내부 컬럼이 응답에 새지 않도록 select 대상을 상수로 고정한다.
 */
export const PIN_COLUMNS = {
  id: pins.id,
  roomId: pins.roomId,
  createdAt: pins.createdAt,
};

/** 핀을 저장한 멤버("누가 추가한 곳") 표시용 프로필 컬럼 집합. */
export const PIN_AUTHOR_COLUMNS = {
  userId: users.id,
  nickname: users.nickname,
  avatar: users.avatar,
};
