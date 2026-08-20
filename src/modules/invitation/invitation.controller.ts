import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  errorResponseApiSchema,
  invitationCodeParamSchema,
  invitationCodeResponseApiSchema,
  invitationPreviewResponseApiSchema,
  type JoinRoomRequest,
  joinRoomRequestApiSchema,
  joinRoomRequestSchema,
  okResponseApiSchema,
  roomIdParamSchema,
} from "./invitation.dto";
import { InvitationService } from "./invitation.service";
import type {
  InvitationCodeResponse,
  InvitationPreviewResponse,
} from "./invitation.type";

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

  @Get("invitations/:code")
  @ApiOperation({
    summary: "초대 코드로 방 미리보기",
    description:
      "인증이 필요 없다(앱 설치 전·온보딩 전 진입). 초대자와 방 정보를 최소로 노출한다.",
  })
  @ApiResponse({
    status: 200,
    description: "방 미리보기",
    schema: invitationPreviewResponseApiSchema,
  })
  @ApiResponse({
    status: 403,
    description: "개인방 (PERSONAL_ROOM_NOT_ALLOWED)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 404,
    description: "초대 없음 (INVITATION_NOT_FOUND)",
    schema: errorResponseApiSchema,
  })
  previewInvitation(
    @Param("code", new ValibotPipe(invitationCodeParamSchema)) code: string,
  ): Promise<InvitationPreviewResponse> {
    return this.invitationService.preview(code);
  }

  @Post("rooms/:roomId/members")
  // 멱등이라 매번 생성되지 않으므로 201이 아닌 200을 준다.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "방 합류",
    description:
      "body의 inviteCode가 path의 roomId에 속한 활성 코드인지 검증한다. " +
      "이미 멤버면 오류 대신 멱등 응답을 준다. 나갔던 방에는 다시 합류할 수 있다.",
  })
  @ApiHeader({
    name: "X-Device-Id",
    description: "요청 유저 식별용 deviceId (인증 정책 TBD — 임시 계약)",
    required: true,
  })
  @ApiBody({ schema: joinRoomRequestApiSchema })
  @ApiResponse({
    status: 200,
    description: "합류 완료(또는 이미 멤버 — 멱등)",
    schema: okResponseApiSchema,
  })
  @ApiResponse({
    status: 400,
    description: "코드가 요청한 방의 것이 아님 (INVALID_INVITE_CODE)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 401,
    description: "요청 유저 식별 불가 (UNIDENTIFIED_USER)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 403,
    description: "개인방 (PERSONAL_ROOM_NOT_ALLOWED)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 404,
    description: "초대 없음 (INVITATION_NOT_FOUND)",
    schema: errorResponseApiSchema,
  })
  async joinRoom(
    @Headers("x-device-id") deviceId: string | undefined,
    @Param("roomId", new ValibotPipe(roomIdParamSchema)) roomId: string,
    @Body(new ValibotPipe(joinRoomRequestSchema)) body: JoinRoomRequest,
  ): Promise<{ ok: true }> {
    await this.invitationService.join(deviceId, roomId, body.inviteCode);
    return { ok: true };
  }
}
