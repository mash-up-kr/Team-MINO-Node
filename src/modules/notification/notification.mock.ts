import {
  NOTIFICATION_DUPLICATE_ID,
  NOTIFICATION_JOINED_ID,
  NOTIFICATION_OWNER_ID,
  PIN_ONION_ID,
  PLACE_ONION_ID,
  ROOM_SHARED_A_ID,
  ROOM_SHARED_B_ID,
  USER_SUJIN_ID,
} from "../../common/mock/ids";
import type { Notification } from "./notification.dto";

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: NOTIFICATION_DUPLICATE_ID,
    type: "duplicate_save",
    payload: {
      roomId: ROOM_SHARED_A_ID,
      pinId: PIN_ONION_ID,
      placeId: PLACE_ONION_ID,
      savedAt: "2026-07-10T09:00:00.000Z",
    },
    readAt: null,
    createdAt: "2026-07-10T09:00:00.000Z",
  },
  {
    id: NOTIFICATION_JOINED_ID,
    type: "member_joined",
    payload: {
      roomId: ROOM_SHARED_A_ID,
      userId: USER_SUJIN_ID,
    },
    readAt: "2026-07-09T18:00:00.000Z",
    createdAt: "2026-07-09T17:30:00.000Z",
  },
  {
    id: NOTIFICATION_OWNER_ID,
    type: "owner_transferred",
    payload: {
      roomId: ROOM_SHARED_B_ID,
    },
    readAt: "2026-07-08T10:00:00.000Z",
    createdAt: "2026-07-08T09:00:00.000Z",
  },
];
