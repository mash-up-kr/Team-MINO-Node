import { Module } from "@nestjs/common";
import { CloudTasksGuard } from "../../common/guards/cloud-tasks.guard";
import { AiModule } from "../../infrastructures/ai/ai.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { GeocoderModule } from "../../infrastructures/geocoder/geocoder.module";
import { PlaceImageModule } from "../../infrastructures/place-image/place-image.module";
import { ScraperModule } from "../../infrastructures/scraper/scraper.module";
import { TasksModule } from "../../infrastructures/tasks/tasks.module";
import { PlaceController } from "./place.controller";
import { PlaceService } from "./place.service";
import { PlaceResultRepository } from "./place-result.repository";
import { PlaceWorkerController } from "./place-worker.controller";

@Module({
  imports: [
    AiModule,
    DatabaseModule,
    GeocoderModule,
    PlaceImageModule,
    ScraperModule,
    TasksModule,
  ],
  controllers: [PlaceController, PlaceWorkerController],
  providers: [CloudTasksGuard, PlaceResultRepository, PlaceService],
})
export class PlaceModule {}
