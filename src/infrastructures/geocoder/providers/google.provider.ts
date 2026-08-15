import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../config/env.schema";
import type {
  GeoCandidate,
  GeocoderProvider,
  GeoQuery,
} from "../geocoder.type";

@Injectable()
export class GoogleProvider implements GeocoderProvider {
  readonly name = "google" as const;

  constructor(private readonly configService: ConfigService<Env>) {}

  // Google Places는 전 세계를 색인하므로 국가로 거르지 않는다.
  supports(_query: GeoQuery): boolean {
    return true;
  }

  async search(_query: GeoQuery): Promise<GeoCandidate[]> {
    throw new Error("Not implemented");
  }
}
