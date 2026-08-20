import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { InvitationRepository } from "./invitation.repository";
import { InvitationService } from "./invitation.service";

@Module({
  imports: [DatabaseModule],
  providers: [InvitationService, InvitationRepository],
})
export class InvitationModule {}
