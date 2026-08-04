import { Module } from "@nestjs/common";
import { AiModule } from "../../infrastructures/ai/ai.module";
import { GeocoderModule } from "../../infrastructures/geocoder/geocoder.module";
import { PlaceImageModule } from "../../infrastructures/place-image/place-image.module";
import { ScraperModule } from "../../infrastructures/scraper/scraper.module";
import { PlaceController } from "./place.controller";
// TODO(임시): 클라 개발 언블록용 mock. 실제 파이프라인 연동되면 제거.
import { PlaceMockController } from "./place.mock.controller";
import { PlaceService } from "./place.service";

@Module({
  imports: [AiModule, GeocoderModule, PlaceImageModule, ScraperModule],
  controllers: [PlaceController, PlaceMockController],
  providers: [PlaceService],
})
export class PlaceModule {}
