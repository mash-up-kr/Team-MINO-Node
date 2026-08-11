import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  type OkResult,
  type PageQuery,
  pageQuerySchema,
} from "../../common/dto/common.dto";
import { PaginatedResult } from "../../common/interceptors/paginated-result";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  dataArraySchema,
  ERROR_RESPONSE_SCHEMA,
  OK_RESPONSE_SCHEMA,
} from "../../common/swagger/api-response";
import {
  type MarkNotificationsReadRequest,
  markNotificationsReadRequestApiSchema,
  markNotificationsReadRequestSchema,
  type Notification,
  notificationResponseApiSchema,
} from "./notification.dto";
import { MOCK_NOTIFICATIONS } from "./notification.mock";

// TODO(mock): swagger.yaml 계약 기준 고정 응답. 피쳐 PR에서 service 호출로 교체.
// TBD 오퍼레이션 — 기획 확정 시 계약 변경 가능.
@ApiTags("Notification")
@ApiBearerAuth()
@Controller("api/v1/notifications")
export class NotificationController {
  @Get()
  @ApiOperation({
    summary: "[TBD] 알림 목록 조회",
    description:
      "**TBD — 알림 종류·알림함 구성이 프디팀 정리 중이라 계약이 잠정이다.**\n(예시 후보: 저장 중복 / 오류 / 친구 합류 / 친구 방 나가기 / 방장 위임)\n확정분: 푸시는 중복·실패·초대 합류 시 발송, 중복 저장 알림은 기존 핀 참조(`roomId`·`pinId`·`placeId`·최초 저장 시각)를\n담아 딥링크로 이동시킨다. offset 기반 페이지네이션.",
  })
  @ApiResponse({
    status: 200,
    description: "알림 목록 (잠정)",
    schema: dataArraySchema(notificationResponseApiSchema, {
      paginated: true,
    }),
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
    schema: ERROR_RESPONSE_SCHEMA,
  })
  async listNotifications(
    @Query(new ValibotPipe(pageQuerySchema)) query: PageQuery,
  ): Promise<PaginatedResult<Notification>> {
    return new PaginatedResult(MOCK_NOTIFICATIONS, {
      pageSize: query.pageSize,
      page: query.page,
      hasNext: false,
    });
  }

  @Post("reads")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "[TBD] 알림 읽음 처리",
    description:
      "**TBD — 알림 기획 확정 전 잠정 계약.** 개별 id 목록 또는 전체 읽음 처리.",
  })
  @ApiBody({ schema: markNotificationsReadRequestApiSchema })
  @ApiResponse({
    status: 200,
    description: "읽음 처리 완료",
    schema: OK_RESPONSE_SCHEMA,
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
    schema: ERROR_RESPONSE_SCHEMA,
  })
  async markNotificationsRead(
    @Body(new ValibotPipe(markNotificationsReadRequestSchema))
    _body: MarkNotificationsReadRequest,
  ): Promise<OkResult> {
    return { ok: true };
  }
}
