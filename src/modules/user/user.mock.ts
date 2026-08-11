import { USER_ME_ID } from "../../common/mock/ids";
import type { User } from "./user.dto";

export const MOCK_USER: User = {
  id: USER_ME_ID,
  nickname: "성수탐험가",
  avatar: { id: 1 },
  createdAt: "2026-06-01T09:00:00.000Z",
};
