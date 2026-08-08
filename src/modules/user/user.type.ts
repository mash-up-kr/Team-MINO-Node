import type { UserAvatar } from "./user.schema";

export type UserProfileRow = {
  id: string;
  nickname: string;
  avatar: UserAvatar | null;
  createdAt: Date;
};

export type CreateUserInput = {
  deviceId: string;
  nickname: string;
  avatar: UserAvatar | null;
};

export type PersonalRoomInput = {
  name: string;
  color: string;
};

export type UpdateProfileInput = {
  nickname?: string;
  avatar?: UserAvatar;
};

/** 프로필 조회 행이 곧 응답 형태다(avatar jsonb 통째 전달). */
export type UserProfileResponse = UserProfileRow;
