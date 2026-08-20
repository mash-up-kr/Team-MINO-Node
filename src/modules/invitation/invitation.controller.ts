import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  errorResponseApiSchema,
  invitationCodeResponseApiSchema,
  roomIdParamSchema,
} from "./invitation.dto";
import { InvitationService } from "./invitation.service";
import type { InvitationCodeResponse } from "./invitation.type";

// TODO: PR #58의 CurrentUserGuard/@CurrentUser 머지 후 x-device-id 직접 읽기를 교체.
@ApiTags("invitation")
@Controller("api/v1")
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post("rooms/:roomId/invitations")
  // 이미 있으면 기존 코드를 돌려주는 멱등 발급이라 201이 아닌 200을 준다.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "내 초대 링크 발급",
    description:
      "멤버당 초대 1개다. 이미 발급했다면 같은 code를 돌려준다(재발급·만료 없음). " +
      "클라이언트가 gguk.org/r/{code} 형태로 링크를 조립한다. 개인방은 초대할 수 없다.",
  })
  @ApiHeader({
    name: "X-Device-Id",
    description: "요청 유저 식별용 deviceId (인증 정책 TBD — 임시 계약)",
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: "초대 코드 (기존 초대가 있으면 같은 값)",
    schema: invitationCodeResponseApiSchema,
  })
  @ApiResponse({
    status: 401,
    description: "요청 유저 식별 불가 (UNIDENTIFIED_USER)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 403,
    description:
      "방 멤버가 아니거나 개인방 (NOT_ROOM_MEMBER / PERSONAL_ROOM_NOT_ALLOWED)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 404,
    description: "방 없음 (ROOM_NOT_FOUND)",
    schema: errorResponseApiSchema,
  })
  createInvitation(
    @Headers("x-device-id") deviceId: string | undefined,
    @Param("roomId", new ValibotPipe(roomIdParamSchema)) roomId: string,
  ): Promise<InvitationCodeResponse> {
    return this.invitationService.create(deviceId, roomId);
  }
}
