import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import { rooms } from "../room/room.schema";
import { roomMembers } from "../room/room-member.schema";
import { users } from "./user.schema";
import type {
  CreateUserInput,
  PersonalRoomInput,
  UpdateProfileInput,
  UserProfileRow,
} from "./user.type";

/**
 * 프로필 응답에 노출하는 컬럼 집합. drizzle은 entity 클래스 없이 테이블
 * 정의가 곧 스키마라, 내부 컬럼(device_id·deleted_at 등)이 응답에 새지
 * 않도록 select 대상 컬럼을 상수로 고정한다.
 */
const USER_PROFILE_COLUMNS = {
  id: users.id,
  nickname: users.nickname,
  avatar: users.avatar,
  createdAt: users.createdAt,
};

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
