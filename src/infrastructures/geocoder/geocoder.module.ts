import { Module } from "@nestjs/common";
import { GEOCODER_PROVIDERS, GeocoderService } from "./geocoder.service";
import { GoogleProvider } from "./providers/google.provider";
import { KakaoProvider } from "./providers/kakao.provider";

@Module({
  providers: [
    KakaoProvider,
    GoogleProvider,
    {
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
