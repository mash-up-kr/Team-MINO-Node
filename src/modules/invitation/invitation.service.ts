import { Injectable } from "@nestjs/common";
import { InvitationRepository } from "./invitation.repository";

@Injectable()
export class InvitationService {
  constructor(
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: 엔드포인트 구현 PR에서 사용합니다.
    private readonly invitationRepository: InvitationRepository,
  ) {}
}
