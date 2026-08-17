import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as v from "valibot";
import { AppException } from "../../../common/exceptions/app.exception";
import type { Env } from "../../../config/env.schema";
import type {
  Coordinate,
  GeoCandidate,
  GeocoderProvider,
  GeoQuery,
} from "../geocoder.type";
import {
  type KakaoAddressDocument,
  type KakaoKeywordDocument,
  kakaoAddressSearchResponseSchema,
  kakaoKeywordSearchResponseSchema,
} from "./kakao.type";

const KAKAO_ADDRESS_SEARCH_URL =
  "https://dapi.kakao.com/v2/local/search/address.json";
const KAKAO_KEYWORD_SEARCH_URL =
  "https://dapi.kakao.com/v2/local/search/keyword.json";
const KAKAO_SEARCH_SIZE = "15";
const KAKAO_ADDRESS_BIAS_RADIUS = "1000";
const KAKAO_REQUEST_TIMEOUT_MS = 5000;

/*
 * 카카오 로컬 API는 국내 장소만 색인한다. 해외 질의를 보내면 0건이 아니라 이름이 겹치는
 * 국내 장소가 걸릴 수 있어("파리 에펠탑" → 상호에 에펠탑이 든 국내 업소) 국가로 먼저 거른다.
 */
const KAKAO_SUPPORTED_COUNTRY_CODE = "KR";

@Injectable()
export class KakaoProvider implements GeocoderProvider {
  readonly name = "kakao" as const;

  constructor(private readonly configService: ConfigService<Env>) {}

  supports(query: GeoQuery): boolean {
    return query.countryCode === KAKAO_SUPPORTED_COUNTRY_CODE;
  }

  async search(query: GeoQuery): Promise<GeoCandidate[]> {
    const apiKey = this.configService.getOrThrow("KAKAO_REST_API_KEY", {
      infer: true,
    });

    if (query.areaType === "address") {
      const addressCoordinate = await this.resolveAddressCoordinate(
        query.areaName,
        apiKey,
      );
      if (addressCoordinate) {
        const biased = await this.searchKeyword(
          this.createAddressBiasedKeywordSearchUrl(query, addressCoordinate),
          apiKey,
        );
        // biased(1km) 결과가 있으면 사용하고, 0건이면 아래 areaName + placeName 검색으로 fallback
        if (biased.length > 0) {
          return biased;
        }
      }
    }

    return this.searchKeyword(this.createKeywordSearchUrl(query), apiKey);
  }

  private async searchKeyword(
    url: string,
    apiKey: string,
  ): Promise<GeoCandidate[]> {
    const body = await this.requestKakao(url, apiKey);
    const parsed = v.safeParse(kakaoKeywordSearchResponseSchema, body);

    if (!parsed.success) {
      throw this.createInvalidResponseException();
    }

    return parsed.output.documents.map((document) =>
      this.toGeoCandidate(document),
    );
  }

  private async requestKakao(url: string, apiKey: string): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(KAKAO_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AppException(
        "KAKAO_REQUEST_FAILED",
        "카카오 장소 검색 요청에 실패했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (response.status === HttpStatus.TOO_MANY_REQUESTS) {
      throw new AppException(
        "KAKAO_RATE_LIMITED",
        "카카오 장소 검색 요청 한도를 초과했습니다.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!response.ok) {
      throw new AppException(
        "KAKAO_REQUEST_FAILED",
        "카카오 장소 검색 요청에 실패했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }

    return this.parseJson(response);
  }

  private async resolveAddressCoordinate(
    areaName: string,
    apiKey: string,
  ): Promise<Coordinate | undefined> {
    if (!areaName.trim()) {
      return undefined;
    }

    try {
      const url = this.createAddressSearchUrl(areaName);
      const body = await this.requestKakao(url, apiKey);
      const parsed = v.safeParse(kakaoAddressSearchResponseSchema, body);

      if (!parsed.success) {
        throw this.createInvalidResponseException();
      }

      return this.toAddressCoordinate(parsed.output.documents[0]);
    } catch {
      return undefined;
    }
  }

  private createAddressSearchUrl(areaName: string): string {
    const url = new URL(KAKAO_ADDRESS_SEARCH_URL);
    url.searchParams.set("query", areaName.trim());
    url.searchParams.set("size", "1");

    return url.toString();
  }

  private createKeywordSearchUrl(query: GeoQuery): string {
    const url = new URL(KAKAO_KEYWORD_SEARCH_URL);
    url.searchParams.set("query", this.createKeyword(query));
    url.searchParams.set("size", KAKAO_SEARCH_SIZE);

    return url.toString();
  }

  private createAddressBiasedKeywordSearchUrl(
    query: GeoQuery,
    addressCoordinate: Coordinate,
  ): string {
    const url = new URL(KAKAO_KEYWORD_SEARCH_URL);
    url.searchParams.set("query", query.placeName.trim());
    url.searchParams.set("x", String(addressCoordinate.lng));
    url.searchParams.set("y", String(addressCoordinate.lat));
    url.searchParams.set("radius", KAKAO_ADDRESS_BIAS_RADIUS);
    url.searchParams.set("sort", "distance");
    url.searchParams.set("size", KAKAO_SEARCH_SIZE);

    return url.toString();
  }

  private createKeyword(query: GeoQuery): string {
    return [query.areaName, query.placeName]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" ");
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw this.createInvalidResponseException();
    }
  }

  private toAddressCoordinate(
    document: KakaoAddressDocument | undefined,
  ): Coordinate | undefined {
    if (!document) return undefined;

    return {
      lat: this.parseCoordinate(document.y),
      lng: this.parseCoordinate(document.x),
    };
  }

  private toGeoCandidate(document: KakaoKeywordDocument): GeoCandidate {
    return {
      provider: this.name,
      providerPlaceId: document.id,
      placeName: document.place_name,
      /*
       * 표시용으로는 도로명이 낫고, Google이 주는 formattedAddress도 도로명 기반이라
       * provider 간 표기가 맞는다. 도로명이 없는 장소는 빈 문자열로 와서 지번으로 떨어진다.
       */
      address: document.road_address_name || document.address_name,
      coordinate: {
        lat: this.parseCoordinate(document.y),
        lng: this.parseCoordinate(document.x),
      },
      distance: this.parseDistance(document.distance),
      mapUrl: document.place_url,
      category: document.category_name || undefined,
    };
  }

  private parseCoordinate(value: string): number {
    const coordinate = Number(value);

    if (!Number.isFinite(coordinate)) {
      throw this.createInvalidResponseException();
    }

    return coordinate;
  }

  private parseDistance(value: string | undefined): number | undefined {
    if (!value) return undefined;

    const distance = Number(value);

    if (!Number.isFinite(distance)) {
      throw this.createInvalidResponseException();
    }

    return distance;
  }

  private createInvalidResponseException(): AppException {
    return new AppException(
      "KAKAO_RESPONSE_INVALID",
      "카카오 장소 검색 응답 형식이 올바르지 않습니다.",
      HttpStatus.BAD_GATEWAY,
    );
  }
}
