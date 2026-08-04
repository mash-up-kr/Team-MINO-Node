import { Module } from "@nestjs/common";
import { PlaceImageService } from "./place-image.service";

@Module({
  providers: [PlaceImageService],
  exports: [PlaceImageService],
})
export class PlaceImageModule {}
