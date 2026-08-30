import { Module } from "@nestjs/common";
import { AuthModule } from "../../infrastructures/auth/auth.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { NotificationModule } from "../notification/notification.module";
import { InvitationController } from "./invitation.controller";
import { InvitationRepository } from "./invitation.repository";
import { InvitationService } from "./invitation.service";

@Module({
  imports: [AuthModule, DatabaseModule, NotificationModule],
  controllers: [InvitationController],
  providers: [InvitationService, InvitationRepository],
})
export class InvitationModule {}
