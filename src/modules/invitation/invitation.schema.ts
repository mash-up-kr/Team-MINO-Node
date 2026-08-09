import {
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { rooms } from "../room/room.schema";
import { users } from "../user/user.schema";
import { INVITATION_CODE_LENGTH } from "./invitation.constant";

export const invitations = pgTable(
  "invitations",
  {
    id: uuid().primaryKey().defaultRandom(),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "no action" }),
    invitedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "no action" }),
    code: varchar({ length: INVITATION_CODE_LENGTH }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("invitations_code_unique").on(t.code),
    // 멤버당 초대 1개
    uniqueIndex("invitations_room_id_invited_by_unique").on(
      t.roomId,
      t.invitedBy,
    ),
  ],
);
