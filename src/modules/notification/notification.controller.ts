import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import type { RequestUser } from "../../common/guards/current-user.guard";
import type { PaginatedResponse } from "../../common/pagination/pagination.type";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { QuerySchema } from "../../common/swagger/query-schema.decorator";
import {
  errorResponseApiSchema,
  type ListNotificationsQuery,
  listNotificationsQuerySchema,
  type NearbyTriggersRequest,
  nearbyTriggersRequestApiSchema,
  nearbyTriggersRequestSchema,
  nearbyTriggersResponseApiSchema,
  notificationListResponseApiSchema,
} from "./notification.dto";
import { NotificationService } from "./notification.service";
import type { NotificationItemResponse } from "./notification.type";

@ApiTags("notification")
@RequireCurrentUser()
@Controller("api/v1/notifications")
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: "알림 목록 조회",
    description:
      "알림함 스펙 3.0.0 기준. 읽음 상태 없음. offset 기반 페이지네이션, 기본 20건.",
  })
  @ApiResponse({ status: 200, schema: notificationListResponseApiSchema })
  listNotifications(
    @CurrentUser() user: RequestUser,
    @QuerySchema(listNotificationsQuerySchema)
    query: ListNotificationsQuery,
  ): Promise<PaginatedResponse<NotificationItemResponse>> {
    return this.notificationService.listPage(
      user.id,
      query.page,
      query.pageSize,
    );
  }

  @Post("nearby-triggers")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "위치 기반 리마인드 트리거",
    description:
      "클라이언트 지오펜스가 보고한 후보 placeId를 검증해 기록한다. 이미 알린 장소는 재발송하지 않는다. 신규가 1건이면 NEARBY_PLACE로, 여러 건이면 앱 밖 알림만 NEARBY_PLACE_SUMMARY 1건으로 묶어 보낸다. 대표 알림은 알림함에 남지 않으며 탭하면 알림 탭으로 이동한다(FR-019).",
  })
  @ApiBody({ schema: nearbyTriggersRequestApiSchema })
  @ApiResponse({ status: 200, schema: nearbyTriggersResponseApiSchema })
  @ApiResponse({
    status: 403,
    description: "접근할 수 없는 placeId 포함 (PLACE_NOT_ACCESSIBLE)",
    schema: errorResponseApiSchema,
  })
  async recordNearbyTriggers(
    @CurrentUser() user: RequestUser,
    @Body(new ValibotPipe(nearbyTriggersRequestSchema))
    body: NearbyTriggersRequest,
  ): Promise<{ newPlaceCount: number }> {
    return {
      newPlaceCount: await this.notificationService.recordNearbyTriggers(
        user.id,
        body.placeIds,
      ),
    };
  }
}
