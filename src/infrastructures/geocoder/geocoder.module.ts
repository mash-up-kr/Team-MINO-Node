import { Module } from "@nestjs/common";
import { GEOCODER_PROVIDERS, GeocoderService } from "./geocoder.service";
import { GoogleProvider } from "./providers/google.provider";
import { KakaoProvider } from "./providers/kakao.provider";

@Module({
  providers: [
    KakaoProvider,
    GoogleProvider,
    {
      // 배열 순서가 곧 우선순위다. Kakao가 국내만 지원하므로 나머지는 Google로 간다.
      provide: GEOCODER_PROVIDERS,
      useFactory: (kakao: KakaoProvider, google: GoogleProvider) => [
        kakao,
        google,
      ],
      inject: [KakaoProvider, GoogleProvider],
    },
    GeocoderService,
  ],
  exports: [GeocoderService],
})
export class GeocoderModule {}
