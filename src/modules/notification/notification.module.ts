import { Module } from "@nestjs/common";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { AuthModule } from "../../infrastructures/auth/auth.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { MessagingModule } from "../../infrastructures/messaging/messaging.module";
import { SentryModule } from "../../infrastructures/sentry/sentry.module";
import { NotificationController } from "./notification.controller";
import { NotificationRepository } from "./notification.repository";
import { NotificationService } from "./notification.service";

@Module({
  imports: [AuthModule, DatabaseModule, MessagingModule, SentryModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository, CurrentUserGuard],
  exports: [NotificationService],
})
export class NotificationModule {}
