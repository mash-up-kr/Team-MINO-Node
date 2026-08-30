import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import { users } from "../user/user.schema";
import {
  type NotificationPayload,
  type NotificationType,
  notifications,
} from "./notification.schema";
import type { NotificationItemResponse } from "./notification.type";

export type RecordNotificationInput = {
  recipientId: string;
  type: NotificationType;
  typeLabel: string;
  targetName: string;
  thumbnailUrl?: string;
  payload?: NotificationPayload;
  key?: string;
};

@Injectable()
export class NotificationRepository extends BaseRepository {
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

  async findPushToken(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ fcmToken: users.fcmToken })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    return row?.fcmToken ?? null;
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
        payload: notifications.payload,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, recipientId),
          isNull(notifications.deletedAt),
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit)
      .offset(offset);
  }
}
