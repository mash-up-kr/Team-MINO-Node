import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { RoomType } from "../room/room.schema";
import { PREVIEW_MEMBER_LIMIT } from "./invitation.constant";
import { InvitationRepository } from "./invitation.repository";
import type {
  InvitationCodeResponse,
  InvitationPreviewResponse,
} from "./invitation.type";

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

  async preview(code: string): Promise<InvitationPreviewResponse> {
    const invitation = await this.requireInvitation(code);

    // 개인방에는 초대를 발급하지 않지만, 남아 있는 코드로 방이 노출되지 않도록 막습니다.
    this.assertNotPersonal(invitation.roomType);

    const [pinCount, memberCount, members] = await Promise.all([
      this.invitationRepository.countActivePins(invitation.roomId),
      this.invitationRepository.countActiveMembers(invitation.roomId),
      this.invitationRepository.findMemberAvatars(
        invitation.roomId,
        PREVIEW_MEMBER_LIMIT,
      ),
    ]);

    return {
      room: {
        id: invitation.roomId,
        type: invitation.roomType,
        name: invitation.name,
        description: invitation.description,
        color: invitation.color,
        pinCount,
        memberCount,
        members,
      },
      inviter: {
        nickname: invitation.inviterNickname,
        avatar: invitation.inviterAvatar,
      },
    };
  }

  private async requireInvitation(code: string) {
    const invitation =
      await this.invitationRepository.findActiveInvitationByCode(code);

    if (!invitation) {
      throw new AppException(
        "INVITATION_NOT_FOUND",
        "초대를 찾을 수 없습니다.",
        HttpStatus.NOT_FOUND,
      );
    }

    return invitation;
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
