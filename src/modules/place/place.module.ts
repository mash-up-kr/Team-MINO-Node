import { Module } from "@nestjs/common";
import { TasksModule } from "../../infrastructures/tasks/tasks.module";
import { PlaceController } from "./place.controller";

@Module({
  imports: [TasksModule],
  controllers: [PlaceController],
})
export class PlaceModule {}
