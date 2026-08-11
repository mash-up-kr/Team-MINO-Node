import {
  ROOM_PERSONAL_ID,
  ROOM_SHARED_A_ID,
  ROOM_SHARED_B_ID,
  USER_JAKE_ID,
  USER_ME_ID,
  USER_SUJIN_ID,
} from "../../common/mock/ids";
import { MOCK_PINS } from "../pin/pin.mock";
import type {
  InvitationPreview,
  Room,
  RoomDetail,
  RoomMember,
  RoomSummary,
} from "./room.dto";

// 방장(isOwner)은 각 방 ownerId와 일치한다: 개인방·성수 방은 ME, 방구석 스크랩은 제이크.
export const MOCK_ROOM_MEMBERS_BY_ROOM: Record<string, RoomMember[]> = {
  [ROOM_PERSONAL_ID]: [
    {
      userId: USER_ME_ID,
      nickname: "성수탐험가",
      avatar: { id: 1 },
      isOwner: true,
      joinedAt: "2026-06-01T09:00:00.000Z",
    },
  ],
  [ROOM_SHARED_A_ID]: [
    {
      userId: USER_ME_ID,
      nickname: "성수탐험가",
      avatar: { id: 1 },
      isOwner: true,
      joinedAt: "2026-06-01T09:00:00.000Z",
    },
    {
      userId: USER_JAKE_ID,
      nickname: "제이크",
      avatar: { id: 2 },
      isOwner: false,
      joinedAt: "2026-06-05T12:00:00.000Z",
    },
    {
      userId: USER_SUJIN_ID,
      nickname: "수진",
      avatar: { id: 3 },
      isOwner: false,
      joinedAt: "2026-06-08T18:30:00.000Z",
    },
  ],
  [ROOM_SHARED_B_ID]: [
    {
      userId: USER_JAKE_ID,
      nickname: "제이크",
      avatar: { id: 2 },
      isOwner: true,
      joinedAt: "2026-06-20T10:00:00.000Z",
    },
    {
      userId: USER_ME_ID,
      nickname: "성수탐험가",
      avatar: { id: 1 },
      isOwner: false,
      joinedAt: "2026-06-21T10:00:00.000Z",
    },
    {
      userId: USER_SUJIN_ID,
      nickname: "수진",
      avatar: { id: 3 },
      isOwner: false,
      joinedAt: "2026-06-22T10:00:00.000Z",
    },
  ],
};

const pinCountOf = (roomId: string): number =>
  MOCK_PINS.filter((pin) => pin.roomId === roomId).length;

const memberCountOf = (roomId: string): number =>
  MOCK_ROOM_MEMBERS_BY_ROOM[roomId]?.length ?? 0;

export const MOCK_ROOM: Room = {
  id: ROOM_SHARED_A_ID,
  type: "shared",
  name: "이번 주말 성수 산책",
  description: "성수동 맛집 지도 — 토요일 코스",
  color: "#FF6B6B",
  ownerId: USER_ME_ID,
  createdAt: "2026-06-05T12:00:00.000Z",
};

export const MOCK_ROOM_DETAIL: RoomDetail = {
  ...MOCK_ROOM,
  pinCount: pinCountOf(ROOM_SHARED_A_ID),
  memberCount: memberCountOf(ROOM_SHARED_A_ID),
};

export const MOCK_ROOMS: RoomSummary[] = [
  {
    id: ROOM_PERSONAL_ID,
    type: "personal",
    name: "내 방",
    description: null,
    color: "#45B7D1",
    ownerId: USER_ME_ID,
    createdAt: "2026-06-01T09:00:00.000Z",
    pinCount: pinCountOf(ROOM_PERSONAL_ID),
    memberCount: memberCountOf(ROOM_PERSONAL_ID),
    hasPlace: false,
    users: MOCK_ROOM_MEMBERS_BY_ROOM[ROOM_PERSONAL_ID],
  },
  {
    ...MOCK_ROOM,
    pinCount: pinCountOf(ROOM_SHARED_A_ID),
    memberCount: memberCountOf(ROOM_SHARED_A_ID),
    hasPlace: true,
    users: MOCK_ROOM_MEMBERS_BY_ROOM[ROOM_SHARED_A_ID],
  },
  {
    id: ROOM_SHARED_B_ID,
    type: "shared",
    name: "방구석 스크랩",
    description: "인스타에서 모아둔 카페 리스트",
    color: "#4ECDC4",
    ownerId: USER_JAKE_ID,
    createdAt: "2026-06-20T10:00:00.000Z",
    pinCount: pinCountOf(ROOM_SHARED_B_ID),
    memberCount: memberCountOf(ROOM_SHARED_B_ID),
    hasPlace: false,
    users: MOCK_ROOM_MEMBERS_BY_ROOM[ROOM_SHARED_B_ID],
  },
];

export const MOCK_INVITATION_PREVIEW: InvitationPreview = {
  roomId: ROOM_SHARED_A_ID,
  name: "이번 주말 성수 산책",
  description: "성수동 맛집 지도 — 토요일 코스",
  color: { id: 3 },
  pinCount: pinCountOf(ROOM_SHARED_A_ID),
  inviter: { nickname: "제이크" },
};
