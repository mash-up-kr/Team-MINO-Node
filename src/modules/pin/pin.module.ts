import { Module } from "@nestjs/common";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { PinController } from "./pin.controller";
import { PinRepository } from "./pin.repository";
import { PinService } from "./pin.service";

@Module({
  imports: [DatabaseModule],
  controllers: [PinController],
  providers: [PinService, PinRepository, CurrentUserGuard],
})
export class PinModule {}
