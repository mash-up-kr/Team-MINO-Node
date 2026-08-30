import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import { type NotificationType, notifications } from "./notification.schema";
import type { NotificationItemResponse } from "./notification.type";

export type RecordNotificationInput = {
  recipientId: string;
  type: NotificationType;
  typeLabel: string;
  targetName: string;
  /** 장소 대상 유형은 장소 대표 이미지(`places.images ->> 0`)를 싣는다. */
  thumbnailUrl?: string;
  url: string;
  /** 멱등 키. 지정하면 같은 수신자에게 같은 키로 두 번 기록되지 않는다. */
  key?: string;
};

@Injectable()
export class NotificationRepository extends BaseRepository {
  /** 이미 같은 키로 남아 있으면 기록하지 않고 null을 돌려준다. */
  async record(input: RecordNotificationInput): Promise<{ id: string } | null> {
    const [row] = await this.db
      .insert(notifications)
      .values(input)
      .onConflictDoNothing({
        target: [notifications.recipientId, notifications.key],
        where: and(
          isNotNull(notifications.key),
          isNull(notifications.deletedAt),
        ),
      })
      .returning({ id: notifications.id });

    return row ?? null;
  }

  async findPage(
    recipientId: string,
    { limit, offset }: { limit: number; offset: number },
  ): Promise<NotificationItemResponse[]> {
    return this.db
      .select({
        id: notifications.id,
        type: notifications.type,
        typeLabel: notifications.typeLabel,
        targetName: notifications.targetName,
        thumbnailUrl: notifications.thumbnailUrl,
        createdAt: notifications.createdAt,
        url: notifications.url,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, recipientId),
          isNull(notifications.deletedAt),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
  }
}
