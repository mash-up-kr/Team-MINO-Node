import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { InvitationController } from "./invitation.controller";
import { InvitationRepository } from "./invitation.repository";
import { InvitationService } from "./invitation.service";

@Module({
  imports: [DatabaseModule],
  controllers: [InvitationController],
  providers: [InvitationService, InvitationRepository],
})
export class InvitationModule {}
