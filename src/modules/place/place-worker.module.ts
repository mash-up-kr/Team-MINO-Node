import { Module } from "@nestjs/common";
import { CloudTasksGuard } from "../../common/guards/cloud-tasks.guard";
import { AiModule } from "../../infrastructures/ai/ai.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { GeocoderModule } from "../../infrastructures/geocoder/geocoder.module";
import { ScraperModule } from "../../infrastructures/scraper/scraper.module";
import { PlaceService } from "./place.service";
import { PlaceResultRepository } from "./place-result.repository";
import { PlaceWorkerController } from "./place-worker.controller";

@Module({
  imports: [AiModule, GeocoderModule, ScraperModule, DatabaseModule],
  controllers: [PlaceWorkerController],
  providers: [CloudTasksGuard, PlaceService, PlaceResultRepository],
})
export class PlaceWorkerModule {}
