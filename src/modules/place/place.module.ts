import { Module } from "@nestjs/common";
import { CloudTasksGuard } from "../../common/guards/cloud-tasks.guard";
import { AiModule } from "../../infrastructures/ai/ai.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { GeocoderModule } from "../../infrastructures/geocoder/geocoder.module";
import { PlaceImageModule } from "../../infrastructures/place-image/place-image.module";
import { ScraperModule } from "../../infrastructures/scraper/scraper.module";
import { PlaceService } from "./place.service";
import { PlaceResultRepository } from "./place-result.repository";
import {
  PLACE_EXTRACTOR,
  PLACE_RESULT_STORE,
  PlaceWorkerController,
} from "./place-worker.controller";

@Module({
  imports: [
    AiModule,
    DatabaseModule,
    GeocoderModule,
    PlaceImageModule,
    ScraperModule,
  ],
  controllers: [PlaceWorkerController],
  providers: [
    CloudTasksGuard,
    PlaceResultRepository,
    PlaceService,
    { provide: PLACE_EXTRACTOR, useExisting: PlaceService },
    { provide: PLACE_RESULT_STORE, useExisting: PlaceResultRepository },
  ],
})
export class PlaceModule {}
