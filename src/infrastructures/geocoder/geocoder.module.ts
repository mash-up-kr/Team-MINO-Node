import { Module } from "@nestjs/common";
import { GEOCODER_PROVIDERS, GeocoderService } from "./geocoder.service";
import { KakaoProvider } from "./providers/kakao.provider";

@Module({
  providers: [
    KakaoProvider,
    {
      // 배열 순서가 곧 우선순위다. 앞의 provider가 질의를 지원하면 그것으로 검색한다.
      provide: GEOCODER_PROVIDERS,
      useFactory: (kakao: KakaoProvider) => [kakao],
      inject: [KakaoProvider],
    },
    GeocoderService,
  ],
  exports: [GeocoderService],
})
export class GeocoderModule {}
