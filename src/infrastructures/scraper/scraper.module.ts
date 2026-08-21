import { Module } from "@nestjs/common";
import {
  InstagramFallbackFetcher,
  NoopInstagramFallbackFetcher,
} from "./providers/instagram.fallback";
import { InstagramProvider } from "./providers/instagram.provider";
import { ScraperService } from "./scraper.service";

@Module({
  providers: [
    InstagramProvider,
    ScraperService,
    // 임베드로 전체 데이터를 못 얻는 게시글의 2차 경로. SaaS 구현이 생기면 여기만 교체.
    {
      provide: InstagramFallbackFetcher,
      useClass: NoopInstagramFallbackFetcher,
    },
  ],
  exports: [ScraperService],
})
export class ScraperModule {}
