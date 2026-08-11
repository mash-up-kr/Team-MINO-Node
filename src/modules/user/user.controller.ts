import { Body, Controller, Put } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { OkResult } from "../../common/dto/common.dto";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  ERROR_RESPONSE_SCHEMA,
  OK_RESPONSE_SCHEMA,
} from "../../common/swagger/api-response";
import {
  type PushTokenRequest,
  pushTokenRequestApiSchema,
  pushTokenRequestSchema,
} from "./user.dto";

// TODO(mock): swagger.yaml 계약 기준 고정 응답. 피쳐 PR에서 service 호출로 교체.
@ApiTags("User")
@Controller("api/v1/users")
export class UserController {
  @Put("me/push-token")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "디바이스 푸시 토큰 등록·갱신",
    description:
      "FCM/APNs 발송 대상 토큰. 알림 기획(TBD) 확정에 따라 계약이 조정될 수 있다.",
  })
  @ApiBody({ schema: pushTokenRequestApiSchema })
  @ApiResponse({
    status: 200,
    description: "등록/갱신 완료",
    schema: OK_RESPONSE_SCHEMA,
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
    schema: ERROR_RESPONSE_SCHEMA,
  })
  async registerPushToken(
    @Body(new ValibotPipe(pushTokenRequestSchema)) _body: PushTokenRequest,
  ): Promise<OkResult> {
    return { ok: true };
  }
}
