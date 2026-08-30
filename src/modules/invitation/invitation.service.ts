import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { SentryErrorReporter } from "../../infrastructures/sentry/sentry-reporter";
import { NotificationService } from "../notification/notification.service";
import type { RoomType } from "../room/room.schema";
import { PREVIEW_MEMBER_LIMIT } from "./invitation.constant";
import { InvitationRepository } from "./invitation.repository";
import type {
  InvitationCodeResponse,
  InvitationPreviewResponse,
} from "./invitation.type";

@Injectable()
export class InvitationService {
  constructor(
    private readonly invitationRepository: InvitationRepository,
    private readonly notificationService: NotificationService,
    private readonly reporter: SentryErrorReporter,
  ) {}

  async create(
    userId: string,
    roomId: string,
  ): Promise<InvitationCodeResponse> {
    await this.requireSharedRoom(roomId);
    await this.requireMembership(roomId, userId);

    const existing =
      await this.invitationRepository.findActiveInvitationByMember(
        roomId,
        userId,
      );
    if (existing) return existing;

    return this.invitationRepository.createInvitation(roomId, userId);
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

  async join(
    userId: string,
    nickname: string,
    roomId: string,
    inviteCode: string,
  ): Promise<void> {
    const invitation = await this.requireInvitation(inviteCode);

    // 코드와 경로의 방이 다르면 엉뚱한 방에 가입시키게 됩니다.
    if (invitation.roomId !== roomId) {
      throw new AppException(
        "INVALID_INVITE_CODE",
        "초대 코드가 요청한 방의 것이 아닙니다.",
        HttpStatus.BAD_REQUEST,
      );
    }

    this.assertNotPersonal(invitation.roomType);

    const membership = await this.invitationRepository.findActiveMembership(
      roomId,
      userId,
    );
    if (membership) return;

    await this.invitationRepository.addMember(roomId, userId);
    try {
      await this.notifyJoined(roomId, invitation.name, userId, nickname);
    } catch (error) {
      this.reporter.report(error as Error, {
        errorCode: "ROOM_JOIN_NOTIFY_FAILED",
        extra: { roomId, userId },
      });
    }
  }

  private async notifyJoined(
    roomId: string,
    roomName: string,
    joinerId: string,
    joinerNickname: string,
  ): Promise<void> {
    const members =
      await this.invitationRepository.findActiveMemberTokens(roomId);
    const joiner = members.find((member) => member.id === joinerId);
    const others = members.filter((member) => member.id !== joinerId);

    await Promise.all([
      ...others.map((member) =>
        this.notificationService.recordAndNotify(
          {
            recipientId: member.id,
            type: "ROOM_MEMBER_JOINED",
            typeLabel: `${joinerNickname}님이 들어왔어요`,
            targetName: roomName,
            payload: { roomId },
          },
          member.fcmToken,
        ),
      ),
      this.notificationService.recordAndNotify(
        {
          recipientId: joinerId,
          type: "ROOM_JOINED_SELF",
          typeLabel: "방에 참가했어요",
          targetName: roomName,
          payload: { roomId },
        },
        joiner?.fcmToken,
      ),
    ]);
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
