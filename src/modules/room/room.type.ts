import type { UserAvatar } from "../user/user.schema";
import type { RoomType } from "./room.schema";

/** 방 응답 공통 필드. */
export type RoomResponse = {
  id: string;
  type: RoomType;
  name: string;
  description: string | null;
  color: string;
  ownerId: string;
  createdAt: Date;
};

export type RoomRow = RoomResponse;

export type CreateSharedRoomInput = {
  name: string;
  description: string | null;
  color: string;
};

export type UpdateRoomInput = {
  name?: string;
  description?: string | null;
  color?: string;
};

/** 방 상세/목록 조회 행 — 핀 수·멤버 수는 SQL 서브쿼리로 함께 내려온다. */
export type RoomWithCountsRow = RoomRow & {
  pinCount: number;
  memberCount: number;
};

/** 방별 최근 핀의 장소 대표 이미지 행 — 방 목록 썸네일용. */
export type RoomPinImageRow = {
  roomId: string;
  imageUrl: string;
};

/** 지정 장소와 일치하는 방의 활성 핀 행. */
export type RoomPlacePinRow = {
  roomId: string;
  pinId: string;
};

/** 요청 유저 관점의 방 조회 행 — 멤버십 검증까지 본 쿼리에서 함께 내려온다. */
export type RoomForUserRow = RoomWithCountsRow & {
  isMember: boolean;
};

/** 멤버 조회 행 — 그룹핑용 roomId를 제외하면 곧 응답 형태다. */
export type MemberWithRoomRow = RoomMemberResponse & { roomId: string };

export type RoomMemberResponse = {
  userId: string;
  nickname: string;
  avatar: UserAvatar | null;
  isOwner: boolean;
  joinedAt: Date;
};

export type RoomSummaryResponse = RoomResponse & {
  pinCount: number;
  memberCount: number;
  /** 최근 핀 최대 4개의 장소 대표 이미지 URL. 저장된 핀이 없으면 방장 아바타 색상 키 1개. */
  thumbnailList: string[];
  /** `?showHasPlaceId=` 지정 시에만 포함 */
  hasPlace?: boolean;
  /** `?showHasPlaceId=` 지정 시 활성 매칭 핀 UUID, 없으면 null */
  matchedPinId?: string | null;
  /** `?showUsers=true` 지정 시에만 포함 */
  users?: RoomMemberResponse[];
};

export type RoomDetailResponse = RoomResponse & {
  pinCount: number;
  memberCount: number;
};
