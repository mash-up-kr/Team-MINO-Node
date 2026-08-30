import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import type { RequestUser } from "../../common/guards/current-user.guard";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from "../../common/pagination/pagination.constant";
import type { PaginatedResponse } from "../../common/pagination/pagination.type";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  type ListNotificationsQuery,
  listNotificationsQuerySchema,
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
    @Query(new ValibotPipe(listNotificationsQuerySchema))
    query: ListNotificationsQuery,
  ): Promise<PaginatedResponse<NotificationItemResponse>> {
    return this.notificationService.listPage(
      user.id,
      query.page ?? DEFAULT_PAGE,
      query.pageSize ?? DEFAULT_PAGE_SIZE,
    );
  }
}
