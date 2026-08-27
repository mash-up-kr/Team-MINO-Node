import { Module } from "@nestjs/common";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { AuthModule } from "../../infrastructures/auth/auth.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { CardController } from "./card.controller";
import { CardRepository } from "./card.repository";
import { CardService } from "./card.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CardController],
  providers: [CardService, CardRepository, CurrentUserGuard],
})
export class CardModule {}
