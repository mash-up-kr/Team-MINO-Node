import { Inject, Injectable } from "@nestjs/common";
import type { GeoCandidate, GeocoderProvider, GeoQuery } from "./geocoder.type";

export const GEOCODER_PROVIDERS = Symbol("GEOCODER_PROVIDERS");

@Injectable()
export class GeocoderService {
  constructor(
    @Inject(GEOCODER_PROVIDERS)
    private readonly providers: GeocoderProvider[],
  ) {}

  async searchAll(_query: GeoQuery): Promise<GeoCandidate[]> {
    throw new Error("Not implemented");
  }
}
