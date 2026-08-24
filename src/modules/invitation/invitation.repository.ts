import { Injectable } from "@nestjs/common";
import { and, count, eq, isNull } from "drizzle-orm";
import { DatabaseService } from "../../infrastructures/db/database.service";
import { isUniqueViolation } from "../../infrastructures/db/db.error";
import { pins } from "../pin/pin.schema";
import { type RoomType, rooms } from "../room/room.schema";
import { roomMembers } from "../room/room-member.schema";
import { type UserAvatar, users } from "../user/user.schema";
import { invitations } from "./invitation.schema";
import { generateInvitationCode } from "./invitation.util";

@Injectable()
export class InvitationRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async findActiveRoom(
    roomId: string,
  ): Promise<{ id: string; type: RoomType } | undefined> {
    const [room] = await this.db
      .select({ id: rooms.id, type: rooms.type })
      .from(rooms)
      .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
      .limit(1);

    return room;
  }

  async findActiveMembership(
    roomId: string,
    userId: string,
  ): Promise<{ id: string } | undefined> {
    const [membership] = await this.db
      .select({ id: roomMembers.id })
      .from(roomMembers)
      .where(
        and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, userId),
          isNull(roomMembers.deletedAt),
        ),
      )
      .limit(1);

    return membership;
  }

  async findActiveInvitationByMember(
    roomId: string,
    invitedBy: string,
  ): Promise<{ code: string } | undefined> {
    const [invitation] = await this.db
      .select({ code: invitations.code })
      .from(invitations)
      .where(
        and(
          eq(invitations.roomId, roomId),
          eq(invitations.invitedBy, invitedBy),
          isNull(invitations.deletedAt),
        ),
      )
      .limit(1);

    return invitation;
  }

  /**
   * 유니크에 걸리는 경우는 둘뿐입니다.
   * - (room_id, invited_by): 동시 요청이라 이미 만들어진 초대를 돌려줍니다.
   * - code: 새 코드로 재시도합니다.
   */
  async createInvitation(
    roomId: string,
    invitedBy: string,
    // 테스트에서 충돌을 재현할 수 있도록 바꿔 끼웁니다.
    nextCode: () => string = generateInvitationCode,
  ): Promise<{ code: string }> {
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const [created] = await this.db
          .insert(invitations)
          .values({ roomId, invitedBy, code: nextCode() })
          .returning({ code: invitations.code });

        return created;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;

        const existing = await this.findActiveInvitationByMember(
          roomId,
          invitedBy,
        );
        if (existing) return existing;
      }
    }

    throw new Error(
      `초대 코드를 ${maxAttempts}회 시도했지만 비어 있는 값을 찾지 못했습니다.`,
    );
  }

  // 삭제된 방은 조인에서 함께 걸러집니다.
  async findActiveInvitationByCode(code: string) {
    const [invitation] = await this.db
      .select({
        roomId: rooms.id,
        roomType: rooms.type,
        name: rooms.name,
        description: rooms.description,
        color: rooms.color,
        inviterNickname: users.nickname,
        inviterAvatar: users.avatar,
      })
      .from(invitations)
      .innerJoin(
        rooms,
        and(eq(invitations.roomId, rooms.id), isNull(rooms.deletedAt)),
      )
      // 초대자가 탈퇴해도 soft delete라 행이 남습니다.
      .innerJoin(users, eq(invitations.invitedBy, users.id))
      .where(and(eq(invitations.code, code), isNull(invitations.deletedAt)))
      .limit(1);

    return invitation;
  }

  async countActiveMembers(roomId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(roomMembers)
      .where(
        and(eq(roomMembers.roomId, roomId), isNull(roomMembers.deletedAt)),
      );

    return row?.value ?? 0;
  }

  async countActivePins(roomId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(pins)
      .where(and(eq(pins.roomId, roomId), isNull(pins.deletedAt)));

    return row?.value ?? 0;
  }

  async findMemberAvatars(
    roomId: string,
    limit: number,
  ): Promise<Array<{ avatar: UserAvatar | null }>> {
    return this.db
      .select({ avatar: users.avatar })
      .from(roomMembers)
      .innerJoin(users, eq(roomMembers.userId, users.id))
      .where(and(eq(roomMembers.roomId, roomId), isNull(roomMembers.deletedAt)))
      .orderBy(roomMembers.joinedAt)
      .limit(limit);
  }

  // 동시 요청으로 활성 유니크에 걸리면 이미 멤버이므로 그대로 둡니다.
  async addMember(roomId: string, userId: string): Promise<void> {
    try {
      await this.db.insert(roomMembers).values({ roomId, userId });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
}
