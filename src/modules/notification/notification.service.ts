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

  /**
   * 알림함에 남기고 푸시도 보낸다.
   *
   * `input.key`가 이미 쓰인 키면 아무것도 하지 않는다 — 기록도 발송도 건너뛴다.
   * `inbox: false`면 알림함에 남기지 않고 푸시만 보낸다. 여러 건을 묶어 앱 밖으로만
   * 한 번 알리는 위치 기반 대표 알림이 그렇다(알림함 스펙 3.0.0 FR-019).
   */
  async recordAndNotify(
    input: RecordNotificationInput,
    fcmToken: string | null | undefined,
    { inbox = true }: { inbox?: boolean } = {},
  ): Promise<void> {
    if (inbox && !(await this.notificationRepository.record(input))) return;
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
