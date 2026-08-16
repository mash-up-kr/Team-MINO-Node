import { Module } from "@nestjs/common";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { TasksModule } from "../../infrastructures/tasks/tasks.module";
import { SourceRepository } from "../source/source.repository";
import { PinController } from "./pin.controller";
import { PinRepository } from "./pin.repository";
import { PinService } from "./pin.service";
import { RoomPinController } from "./room-pin.controller";

@Module({
  imports: [DatabaseModule, TasksModule],
  controllers: [PinController, RoomPinController],
  providers: [PinService, PinRepository, SourceRepository, CurrentUserGuard],
})
export class PinModule {}
