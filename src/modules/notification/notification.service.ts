import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { PaginatedResponse } from "../../common/pagination/pagination.type";
import { MessagingService } from "../../infrastructures/messaging/messaging.service";
import { SentryErrorReporter } from "../../infrastructures/sentry/sentry-reporter";
import {
  type NearbyPlace,
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

  async recordNearbyTriggers(
    userId: string,
    placeIds: string[],
  ): Promise<number> {
    const accessible = await this.notificationRepository.findAccessiblePlaces(
      userId,
      placeIds,
    );
    if (accessible.length !== placeIds.length) {
      throw new AppException(
        "PLACE_NOT_ACCESSIBLE",
        "접근할 수 없는 장소가 포함되어 있습니다.",
        HttpStatus.FORBIDDEN,
      );
    }

    const created: NearbyPlace[] = [];
    for (const place of accessible) {
      const recorded = await this.notificationRepository.record({
        recipientId: userId,
        type: "NEARBY_PLACE",
        typeLabel: "근처에 저장한 장소가 있어요",
        targetName: place.placeName,
        thumbnailUrl: place.thumbnailUrl ?? undefined,
        payload: { placeId: place.placeId, pinId: place.pinId },
        key: `NEARBY_PLACE:${place.placeId}`,
      });
      if (recorded) created.push(place);
    }

    const [first, ...rest] = created;
    if (!first) return 0;

    const fcmToken = await this.findPushTokenSafely(userId);
    if (!fcmToken) return created.length;

    // 여러 건이면 앱 밖 알림만 대표 하나로 묶는다. 대표는 알림함 행이 없다(FR-019).
    await this.messagingService.sendToTokens(
      [fcmToken],
      rest.length === 0
        ? {
            title: first.placeName,
            body: "근처에 저장한 장소가 있어요",
            imageUrl: first.thumbnailUrl ?? undefined,
            data: {
              type: "NEARBY_PLACE",
              placeId: first.placeId,
              pinId: first.pinId,
            },
          }
        : {
            title: `근처에 저장한 곳 ${created.length}개가 있어요`,
            body: "반경 3km",
            data: { type: "NEARBY_PLACE_SUMMARY" },
          },
    );

    return created.length;
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
