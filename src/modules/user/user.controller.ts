import { Body, Controller, Get, Patch, Post, Put } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthUid } from "../../common/decorators/auth-uid.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireAuthUid } from "../../common/decorators/require-auth-uid.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import type { RequestUser } from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  errorResponseApiSchema,
  okResponseApiSchema,
  type RegisterUserRequest,
  registerUserRequestApiSchema,
  registerUserRequestSchema,
  type UpdatePushTokenRequest,
  updatePushTokenRequestApiSchema,
  updatePushTokenRequestSchema,
  type UpdateProfileRequest,
  updateProfileRequestApiSchema,
  updateProfileRequestSchema,
  userResponseApiSchema,
} from "./user.dto";
import { UserService } from "./user.service";
import type { UserProfileResponse } from "./user.type";

@ApiTags("user")
@Controller("api/v1/users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  // 등록 전이라 users 행이 없으므로, 토큰만 검증하는 가드를 쓴다.
  @RequireAuthUid()
  @ApiOperation({
    summary: "유저 등록 (+ 개인방 자동 생성)",
    description:
      "익명 인증 토큰의 uid로 등록한다. 개인방(내 장소) 생성이 같은 흐름에서 처리되며 응답에는 포함하지 않는다.",
  })
  @ApiBody({ schema: registerUserRequestApiSchema })
  @ApiResponse({ status: 201, schema: userResponseApiSchema })
  @ApiResponse({
    status: 409,
    description: "이미 등록된 계정 (USER_ALREADY_REGISTERED)",
    schema: errorResponseApiSchema,
  })
  register(
    @AuthUid() authUid: string,
    @Body(new ValibotPipe(registerUserRequestSchema))
    body: RegisterUserRequest,
  ): Promise<UserProfileResponse> {
    return this.userService.register(authUid, body);
  }

  @Get("me")
  @RequireCurrentUser()
  @ApiOperation({ summary: "내 프로필 조회" })
  @ApiResponse({ status: 200, schema: userResponseApiSchema })
  getMe(@CurrentUser() user: RequestUser): Promise<UserProfileResponse> {
    return this.userService.getProfile(user.id);
  }

  @Patch("me")
  @RequireCurrentUser()
  @ApiOperation({
    summary: "프로필 수정",
    description: "닉네임(한글/영문 2~15자, 공백·숫자 불가)·아바타 수정",
  })
  @ApiBody({ schema: updateProfileRequestApiSchema })
  @ApiResponse({ status: 200, schema: userResponseApiSchema })
  updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ValibotPipe(updateProfileRequestSchema))
    body: UpdateProfileRequest,
  ): Promise<UserProfileResponse> {
    return this.userService.updateProfile(user.id, body);
  }

  @Put("me/push-token")
  @RequireCurrentUser()
  @ApiOperation({
    summary: "디바이스 푸시 토큰 등록·갱신",
    description:
      "FCM 등록 토큰. 재설치로 새 유저가 생성되면 이전 유저 행의 토큰을 회수한다.",
  })
  @ApiBody({ schema: updatePushTokenRequestApiSchema })
  @ApiResponse({ status: 200, schema: okResponseApiSchema })
  async updatePushToken(
    @CurrentUser() user: RequestUser,
    @Body(new ValibotPipe(updatePushTokenRequestSchema))
    body: UpdatePushTokenRequest,
  ): Promise<{ ok: true }> {
    await this.userService.updatePushToken(user.id, body.token);
    return { ok: true };
  }
}
