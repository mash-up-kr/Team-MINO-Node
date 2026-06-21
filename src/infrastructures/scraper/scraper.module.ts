import { Module } from "@nestjs/common";
import { InstagramProvider } from "./providers/instagram.provider";
import { ScraperService } from "./scraper.service";

@Module({
  providers: [InstagramProvider, ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
