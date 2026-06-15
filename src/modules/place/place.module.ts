import { Module } from "@nestjs/common";
import { AiModule } from "../../infrastructures/ai/ai.module";
import { GeocoderModule } from "../../infrastructures/geocoder/geocoder.module";
import { InstagramModule } from "../../infrastructures/instagram/instagram.module";
import { PlaceController } from "./place.controller";
import { PlaceService } from "./place.service";

@Module({
  imports: [AiModule, GeocoderModule, InstagramModule],
  controllers: [PlaceController],
  providers: [PlaceService],
})
export class PlaceModule {}
