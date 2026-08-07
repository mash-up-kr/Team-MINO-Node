import { Module } from "@nestjs/common";
import { SentryModule } from "../sentry/sentry.module";
import { PlaceImageService } from "./place-image.service";

@Module({
  imports: [SentryModule],
  providers: [PlaceImageService],
  exports: [PlaceImageService],
})
export class PlaceImageModule {}
