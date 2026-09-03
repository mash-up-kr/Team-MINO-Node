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
        imageUrl: input.thumbnailUrl,
        data: { type: input.type, ...input.payload },
      });
    }
  }

  async recordAndNotifyUser(
    input: RecordNotificationInput,
    options?: { inbox?: boolean },
  ): Promise<void> {
    const fcmToken = await this.findPushTokenSafely(input.recipientId);
    await this.recordAndNotify(input, fcmToken, options);
  }

  private async findPushTokenSafely(userId: string): Promise<string | null> {
    try {
      return await this.notificationRepository.findPushToken(userId);
    } catch (error) {
      this.reporter.report(error as Error, {
        errorCode: "NOTIFICATION_TOKEN_LOOKUP_FAILED",
      });
      return null;
    }
  }

  async remindTopCommentedPlaces(): Promise<number> {
    const targets =
      await this.notificationRepository.findTopCommentedPlacePerUser();
    const today = new Date()
      .toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
      .slice(0, 10);

    // 전체 유저 대상이라 50개씩 끊어 동시 FCM 요청 수를 묶는다.
    for (let index = 0; index < targets.length; index += 50) {
      const chunk = targets.slice(index, index + 50);
      await Promise.all(
        chunk.map((target) =>
          this.recordAndNotify(
            {
              recipientId: target.userId,
              type: "TOP_COMMENTED_PLACE",
              typeLabel: "코멘트가 제일 많이 달린 장소에요",
              targetName: target.placeName,
              thumbnailUrl: target.thumbnailUrl ?? undefined,
              payload: { placeId: target.placeId, pinId: target.pinId },
              key: `TOP_COMMENTED_PLACE:${target.placeId}:${today}`,
            },
            target.fcmToken,
          ),
        ),
      );
    }

    return targets.length;
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
