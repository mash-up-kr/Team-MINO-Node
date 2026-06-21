import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../config/env.schema";
import type {
  GeoCandidate,
  GeocoderProvider,
  GeoQuery,
} from "../geocoder.type";

@Injectable()
export class KakaoProvider implements GeocoderProvider {
  readonly name = "kakao" as const;

  constructor(private readonly configService: ConfigService<Env>) {}

  async search(_query: GeoQuery): Promise<GeoCandidate[]> {
    throw new Error("Not implemented");
  }
}
