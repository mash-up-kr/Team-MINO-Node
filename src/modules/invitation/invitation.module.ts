import { Module } from "@nestjs/common";
import { AuthModule } from "../../infrastructures/auth/auth.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { SentryModule } from "../../infrastructures/sentry/sentry.module";
import { NotificationModule } from "../notification/notification.module";
import { InvitationController } from "./invitation.controller";
import { InvitationRepository } from "./invitation.repository";
import { InvitationService } from "./invitation.service";

@Module({
  imports: [AuthModule, DatabaseModule, NotificationModule, SentryModule],
  controllers: [InvitationController],
  providers: [InvitationService, InvitationRepository],
  // 초대 랜딩(AppLinkModule)이 미리보기를 그대로 재사용한다.
  exports: [InvitationService],
})
export class InvitationModule {}
