import { Injectable } from "@nestjs/common";
import type { PaginatedResponse } from "../../common/pagination/pagination.type";
import { MessagingService } from "../../infrastructures/messaging/messaging.service";
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
  ) {}

  async recordAndNotify(
    input: RecordNotificationInput,
    fcmToken: string | null | undefined,
  ): Promise<void> {
    await this.notificationRepository.record(input);
    if (fcmToken) {
      await this.messagingService.sendToTokens([fcmToken], {
        title: input.targetName,
        body: input.typeLabel,
        data: { type: input.type, url: input.url },
      });
    }
  }

  /** 읽음 상태는 두지 않는다(알림함 스펙 3.0.0). */
  async listPage(
    recipientId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<NotificationItemResponse>> {
    // pageSize+1개를 조회해 다음 페이지 존재 여부를 판별한다
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
