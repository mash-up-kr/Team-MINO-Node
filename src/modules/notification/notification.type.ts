import type {
  NotificationPayload,
  NotificationType,
} from "./notification.schema";

export type NotificationItemResponse = {
  id: string;
  type: NotificationType;
  typeLabel: string;
  targetName: string;
  thumbnailUrl: string | null;
  payload: NotificationPayload | null;
  createdAt: Date;
};
