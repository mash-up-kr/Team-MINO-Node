import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../../common/guards/current-user.decorator";
import {
  CurrentUserGuard,
  type RequestUser,
} from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  errorResponseApiSchema,
  type RegisterUserRequest,
  registerUserRequestApiSchema,
  registerUserRequestSchema,
  type UpdateProfileRequest,
  updateProfileRequestApiSchema,
  updateProfileRequestSchema,
  userResponseApiSchema,
} from "./user.dto";
import { UserService } from "./user.service";
import type { UserProfileResponse } from "./user.type";

/** 요청 유저 식별 헤더 문서화 — 인증 정책 확정 전 임시 계약 (TBD) */
const DEVICE_ID_API_HEADER = {
  name: "X-Device-Id",
  description: "요청 유저 식별용 deviceId (인증 정책 TBD — 임시 계약)",
  required: true,
} as const;

@ApiTags("user")
@Controller("api/v1/users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({
    summary: "유저 등록 (+ 개인방 자동 생성)",
    description:
      "deviceId 기반 등록. 개인방(내 방) 생성이 같은 흐름에서 처리되며 응답에는 포함하지 않는다.",
  })
  @ApiBody({ schema: registerUserRequestApiSchema })
  @ApiResponse({ status: 201, schema: userResponseApiSchema })
  @ApiResponse({
    status: 409,
    description: "이미 등록된 deviceId (DEVICE_ALREADY_REGISTERED)",
    schema: errorResponseApiSchema,
  })
  register(
    @Body(new ValibotPipe(registerUserRequestSchema))
    body: RegisterUserRequest,
  ): Promise<UserProfileResponse> {
    return this.userService.register(body);
  }

  @Get("me")
  @UseGuards(CurrentUserGuard)
  @ApiHeader(DEVICE_ID_API_HEADER)
  @ApiOperation({ summary: "내 프로필 조회" })
  @ApiResponse({ status: 200, schema: userResponseApiSchema })
  getMe(@CurrentUser() user: RequestUser): Promise<UserProfileResponse> {
    return this.userService.getProfile(user.id);
  }

  @Patch("me")
  @UseGuards(CurrentUserGuard)
  @ApiHeader(DEVICE_ID_API_HEADER)
  @ApiOperation({
    summary: "프로필 수정",
    description: "닉네임(공백 포함 한글/영문 2~15자)·아바타 수정",
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
}
