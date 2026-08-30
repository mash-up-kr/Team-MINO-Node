import { Injectable } from "@nestjs/common";
import type { PaginatedResponse } from "../../common/pagination/pagination.type";
import { MessagingService } from "../../infrastructures/messaging/messaging.service";
import { SentryErrorReporter } from "../../infrastructures/sentry/sentry-reporter";
import {
  NotificationRepository,
  type RecordNotificationInput,
} from "./notification.repository";
import type { NotificationItemResponse } from "./notification.type";

@Injectable()
export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly messagingService: MessagingService,
    private readonly reporter: SentryErrorReporter,
  ) {}

  // 던지지 않는다. 알림 실패가 호출부의 작업을 되돌리면 안 된다.
  async recordAndNotify(
    input: RecordNotificationInput,
    fcmToken: string | null | undefined,
    { inbox = true }: { inbox?: boolean } = {},
  ): Promise<void> {
    try {
      if (inbox && !(await this.notificationRepository.record(input))) return;
    } catch (error) {
      this.reporter.report(error as Error, {
        errorCode: "NOTIFICATION_RECORD_FAILED",
      });
      return;
    }
    if (fcmToken) {
      await this.messagingService.sendToTokens([fcmToken], {
        title: input.targetName,
        body: input.typeLabel,
        data: { type: input.type, ...input.payload },
      });
    }
  }

  async listPage(
    recipientId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<NotificationItemResponse>> {
    const rows = await this.notificationRepository.findPage(recipientId, {
      limit: pageSize + 1,
      offset: page * pageSize,
    });

    return {
      data: rows.slice(0, pageSize),
      pagination: { pageSize, page, hasNext: rows.length > pageSize },
    };
  }
}
