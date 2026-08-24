import { Module } from "@nestjs/common";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { AuthModule } from "../../infrastructures/auth/auth.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { PinController } from "./pin.controller";
import { PinRepository } from "./pin.repository";
import { PinService } from "./pin.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [PinController],
  providers: [PinService, PinRepository, CurrentUserGuard],
})
export class PinModule {}
