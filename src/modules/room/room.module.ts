import { Module } from "@nestjs/common";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { RoomController } from "./room.controller";
import { RoomRepository } from "./room.repository";
import { RoomService } from "./room.service";

@Module({
  imports: [DatabaseModule],
  controllers: [RoomController],
  providers: [RoomService, RoomRepository, CurrentUserGuard],
})
export class RoomModule {}
