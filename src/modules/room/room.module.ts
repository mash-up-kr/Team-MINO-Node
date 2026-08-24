import { Module } from "@nestjs/common";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { AuthModule } from "../../infrastructures/auth/auth.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { RoomController } from "./room.controller";
import { RoomRepository } from "./room.repository";
import { RoomService } from "./room.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [RoomController],
  providers: [RoomService, RoomRepository, CurrentUserGuard],
})
export class RoomModule {}
