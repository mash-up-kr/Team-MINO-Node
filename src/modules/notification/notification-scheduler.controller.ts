import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CloudTasksGuard } from "../../common/guards/cloud-tasks.guard";
import { NotificationService } from "./notification.service";

@ApiTags("Internal")
@Controller("api-internal/v1/schedules")
@UseGuards(CloudTasksGuard)
export class NotificationSchedulerController {
  private readonly logger = new Logger(NotificationSchedulerController.name);

  constructor(private readonly notificationService: NotificationService) {}

  @Post("top-commented-reminders")
  @ApiOperation({
    summary: "Cloud Scheduler 전용 코멘트 기반 리마인드 배치",
    description: "클라이언트에서 직접 호출하지 않음",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remindTopCommented(): Promise<void> {
    const targets = await this.notificationService.remindTopCommentedPlaces();
    this.logger.log({ targets }, "Top commented reminder batch finished");
  }
}
