import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import { rooms } from "../room/room.schema";
import { roomMembers } from "../room/room-member.schema";
import { USER_PROFILE_COLUMNS } from "./user.constant";
import { users } from "./user.schema";
import type {
  CreateUserInput,
  PersonalRoomInput,
  UpdateProfileInput,
  UserProfileRow,
} from "./user.type";

@Injectable()
export class UserRepository extends BaseRepository {
  /** 유저 + 개인방 + 본인 멤버십을 한 트랜잭션으로 생성한다. */
  async createWithPersonalRoom(
    user: CreateUserInput,
    personalRoom: PersonalRoomInput,
  ): Promise<UserProfileRow> {
    return await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values(user)
        .returning(USER_PROFILE_COLUMNS);
      if (!created) {
        throw new Error("유저 등록에 실패했습니다.");
      }

      const [room] = await tx
        .insert(rooms)
        .values({
          ownerId: created.id,
          type: "personal",
          name: personalRoom.name,
          color: personalRoom.color,
        })
        .returning({ id: rooms.id });
      if (!room) {
        throw new Error("개인방 생성에 실패했습니다.");
      }

      await tx
        .insert(roomMembers)
        .values({ roomId: room.id, userId: created.id });

      return created;
    });
  }

  async findActiveById(userId: string): Promise<UserProfileRow | undefined> {
    const [row] = await this.db
      .select(USER_PROFILE_COLUMNS)
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    return row;
  }

  async updateActiveById(
    userId: string,
    patch: UpdateProfileInput,
  ): Promise<UserProfileRow | undefined> {
    const [row] = await this.db
      .update(users)
      .set(patch)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning(USER_PROFILE_COLUMNS);
    return row;
  }
}
