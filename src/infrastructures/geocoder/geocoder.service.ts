import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { GeoCandidate, GeocoderProvider, GeoQuery } from "./geocoder.type";

export const GEOCODER_PROVIDERS = Symbol("GEOCODER_PROVIDERS");

@Injectable()
export class GeocoderService {
  private readonly logger = new Logger(GeocoderService.name);

  constructor(
    @Inject(GEOCODER_PROVIDERS)
    private readonly providers: GeocoderProvider[],
  ) {}

  async searchAll(query: GeoQuery): Promise<GeoCandidate[]> {
    const settled = await Promise.allSettled(
      this.providers.map((provider) => provider.search(query)),
    );
    settled.forEach((result, index) => {
      if (result.status === "rejected") {
        this.logger.warn(
          `Geocoder provider "${this.providers[index].name}" failed: ${result.reason}`,
        );
      }
    });
    const succeeded = settled.filter(
      (result): result is PromiseFulfilledResult<GeoCandidate[]> =>
        result.status === "fulfilled",
    );

    if (succeeded.length === 0 && settled.length > 0) {
      throw new AppException(
        "GEOCODER_ALL_PROVIDERS_FAILED",
        "모든 지도 검색 제공자가 실패했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }

    return succeeded.flatMap((result) => result.value);
  }
}
