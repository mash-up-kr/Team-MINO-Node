import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { DatabaseService } from "../../infrastructures/db/database.service";
import { isUniqueViolation } from "../../infrastructures/db/db.error";
import { type RoomType, rooms } from "../room/room.schema";
import { roomMembers } from "../room/room-member.schema";
import { users } from "../user/user.schema";
import { invitations } from "./invitation.schema";
import { generateInvitationCode } from "./invitation.util";

@Injectable()
export class InvitationRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async findActiveUserByDeviceId(
    deviceId: string,
  ): Promise<{ id: string } | undefined> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.deviceId, deviceId), isNull(users.deletedAt)))
      .limit(1);

    return user;
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
}
