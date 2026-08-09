import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { RoomType } from "../room/room.schema";
import { InvitationRepository } from "./invitation.repository";
import type { InvitationCodeResponse } from "./invitation.type";

@Injectable()
export class InvitationService {
  constructor(private readonly invitationRepository: InvitationRepository) {}

  async create(
    deviceId: string | undefined,
    roomId: string,
  ): Promise<InvitationCodeResponse> {
    const user = await this.requireUser(deviceId);
    await this.requireSharedRoom(roomId);
    await this.requireMembership(roomId, user.id);

    const existing =
      await this.invitationRepository.findActiveInvitationByMember(
        roomId,
        user.id,
      );
    if (existing) return existing;

    return this.invitationRepository.createInvitation(roomId, user.id);
  }

  private async requireUser(
    deviceId: string | undefined,
  ): Promise<{ id: string }> {
    const trimmed = deviceId?.trim();

    if (trimmed) {
      const user =
        await this.invitationRepository.findActiveUserByDeviceId(trimmed);
      if (user) return user;
    }

    throw new AppException(
      "UNIDENTIFIED_USER",
      "요청 유저를 식별할 수 없습니다.",
      HttpStatus.UNAUTHORIZED,
    );
  }

  private async requireSharedRoom(roomId: string): Promise<void> {
    const room = await this.invitationRepository.findActiveRoom(roomId);

    if (!room) {
      throw new AppException(
        "ROOM_NOT_FOUND",
        "방을 찾을 수 없습니다.",
        HttpStatus.NOT_FOUND,
      );
    }

    this.assertNotPersonal(room.type);
  }

  private async requireMembership(
    roomId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.invitationRepository.findActiveMembership(
      roomId,
      userId,
    );

    if (!membership) {
      throw new AppException(
        "NOT_ROOM_MEMBER",
        "방의 멤버가 아닙니다.",
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private assertNotPersonal(roomType: RoomType): void {
    if (roomType === "personal") {
      throw new AppException(
        "PERSONAL_ROOM_NOT_ALLOWED",
        "개인방은 초대할 수 없습니다.",
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
