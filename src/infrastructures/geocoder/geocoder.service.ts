import { Inject, Injectable, Logger } from "@nestjs/common";
import type { GeoCandidate, GeocoderProvider, GeoQuery } from "./geocoder.type";

export const GEOCODER_PROVIDERS = Symbol("GEOCODER_PROVIDERS");

@Injectable()
export class GeocoderService {
  private readonly logger = new Logger(GeocoderService.name);

  constructor(
    @Inject(GEOCODER_PROVIDERS)
    private readonly providers: GeocoderProvider[],
  ) {}

  /**
   * 질의를 다룰 수 있는 provider 중 우선순위가 가장 높은 하나로 검색한다.
   *
   * 우선순위는 GEOCODER_PROVIDERS 주입 순서다. 여러 provider에 같은 질의를 보내지 않는 이유는
   * 국가마다 정확한 provider가 정해져 있어 병합할 이유가 없고, 유료 provider 호출 수를 줄이기 위함이다.
   */
  async search(query: GeoQuery): Promise<GeoCandidate[]> {
    const [provider] = this.providers.filter((candidate) =>
      candidate.supports(query),
    );

    if (!provider) {
      this.logger.warn(
        { countryCode: query.countryCode, placeName: query.placeName },
        "질의를 지원하는 지오코더 provider 없음 — 빈 결과",
      );
      return [];
    }

    return provider.search(query);
  }
}
