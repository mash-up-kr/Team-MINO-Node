import { Module } from "@nestjs/common";
import { SentryModule } from "../sentry/sentry.module";
import { InstagramEmbedProvider } from "./providers/instagram-embed.provider";
import { InstagramPolarisHtmlProvider } from "./providers/instagram-polaris-html.provider";
import { InstagramPolarisJsonProvider } from "./providers/instagram-polaris-json.provider";
import { INSTAGRAM_PROVIDERS, ScraperService } from "./scraper.service";
import type { InstagramProvider } from "./scraper.type";

@Module({
  imports: [SentryModule],
  providers: [
    InstagramPolarisJsonProvider,
    InstagramPolarisHtmlProvider,
    InstagramEmbedProvider,
    {
      provide: INSTAGRAM_PROVIDERS,
      useFactory: (...providers: InstagramProvider[]) => providers,
      // 폴백 우선순위는 이 배열 순서 하나로만 정의된다.
      inject: [
        InstagramPolarisJsonProvider,
        InstagramPolarisHtmlProvider,
        InstagramEmbedProvider,
      ],
    },
    ScraperService,
  ],
  exports: [ScraperService],
})
export class ScraperModule {}
