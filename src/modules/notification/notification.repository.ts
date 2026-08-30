import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import { type NotificationType, notifications } from "./notification.schema";
import type { NotificationItemResponse } from "./notification.type";

export type RecordNotificationInput = {
  recipientId: string;
  type: NotificationType;
  typeLabel: string;
  targetName: string;
  thumbnailUrl?: string;
  url: string;
};

@Injectable()
export class NotificationRepository extends BaseRepository {
  async record(input: RecordNotificationInput): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(notifications)
      .values(input)
      .returning({ id: notifications.id });

    return row;
  }

  async findPage(
    recipientId: string,
    { limit, offset }: { limit: number; offset: number },
  ): Promise<NotificationItemResponse[]> {
    return this.db
      .select({
        id: notifications.id,
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
