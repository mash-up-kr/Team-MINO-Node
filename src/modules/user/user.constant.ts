import { users } from "./user.schema";

/**
 * 프로필 응답에 노출하는 컬럼 집합. drizzle은 entity 클래스 없이 테이블
 * 정의가 곧 스키마라, 내부 컬럼(device_id·deleted_at 등)이 응답에 새지
 * 않도록 select 대상 컬럼을 상수로 고정한다.
 */
export const USER_PROFILE_COLUMNS = {
  id: users.id,
  nickname: users.nickname,
  avatar: users.avatar,
  createdAt: users.createdAt,
};
