import type { rooms } from "../room/room.schema";
import type { users } from "../user/user.schema";

type Room = typeof rooms.$inferSelect;
type User = typeof users.$inferSelect;

export type InvitationCodeResponse = {
  code: string;
};

export type InvitationPreviewResponse = {
  room: Pick<Room, "id" | "type" | "name" | "description" | "color"> & {
    pinCount: number;
    memberCount: number;
    members: Pick<User, "avatar">[];
  };
  inviter: Pick<User, "nickname" | "avatar">;
};
