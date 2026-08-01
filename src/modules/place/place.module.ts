import { Module } from "@nestjs/common";
import { AiModule } from "../../infrastructures/ai/ai.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { GeocoderModule } from "../../infrastructures/geocoder/geocoder.module";
import { ScraperModule } from "../../infrastructures/scraper/scraper.module";
import { TasksModule } from "../../infrastructures/tasks/tasks.module";
import { PlaceController } from "./place.controller";
import { PlaceService } from "./place.service";
import { PlaceJobController } from "./place-job.controller";
import { PlaceJobRepository } from "./place-job.repository";
import { PlaceJobService } from "./place-job.service";
import { PlaceJobWorkerController } from "./place-job-worker.controller";

@Module({
  imports: [
    AiModule,
    GeocoderModule,
    ScraperModule,
    DatabaseModule,
    TasksModule,
  ],
  controllers: [PlaceController, PlaceJobController, PlaceJobWorkerController],
  providers: [PlaceService, PlaceJobService, PlaceJobRepository],
})
export class PlaceModule {}
