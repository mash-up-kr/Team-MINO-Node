import { Module } from "@nestjs/common";
import { CloudTasksGuard } from "../../common/guards/cloud-tasks.guard";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { AuthModule } from "../../infrastructures/auth/auth.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { MessagingModule } from "../../infrastructures/messaging/messaging.module";
import { SentryModule } from "../../infrastructures/sentry/sentry.module";
import { NotificationController } from "./notification.controller";
import { NotificationRepository } from "./notification.repository";
import { NotificationService } from "./notification.service";
import { NotificationSchedulerController } from "./notification-scheduler.controller";

@Module({
  imports: [AuthModule, DatabaseModule, MessagingModule, SentryModule],
  controllers: [NotificationController, NotificationSchedulerController],
  providers: [
    NotificationService,
    NotificationRepository,
    CurrentUserGuard,
    CloudTasksGuard,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
