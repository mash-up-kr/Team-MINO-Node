import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as v from "valibot";
import { AppException } from "../../../common/exceptions/app.exception";
import type { Env } from "../../../config/env.schema";
import type {
  GeoCandidate,
  GeocoderProvider,
  GeoQuery,
} from "../geocoder.type";
import {
  type KakaoKeywordDocument,
  kakaoKeywordSearchResponseSchema,
} from "./kakao.type";

const KAKAO_KEYWORD_SEARCH_URL =
  "https://dapi.kakao.com/v2/local/search/keyword.json";
const KAKAO_SEARCH_SIZE = "15";
const KAKAO_REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class KakaoProvider implements GeocoderProvider {
  readonly name = "kakao" as const;

  constructor(private readonly configService: ConfigService<Env>) {}

  async search(query: GeoQuery): Promise<GeoCandidate[]> {
    const apiKey = this.getApiKey();
    const url = this.createKeywordSearchUrl(query);
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

    const body = await this.parseJson(response);
    const parsed = v.safeParse(kakaoKeywordSearchResponseSchema, body);

    if (!parsed.success) {
      throw this.createInvalidResponseException();
    }

    return parsed.output.documents.map((document) =>
      this.toGeoCandidate(document),
    );
  }

  private getApiKey(): string {
    const apiKey = this.configService.get("KAKAO_REST_API_KEY", {
      infer: true,
    });

    if (!apiKey?.trim()) {
      throw new AppException(
        "KAKAO_REST_API_KEY_MISSING",
        "카카오 REST API 키가 설정되지 않았습니다.",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return apiKey;
  }

  private createKeywordSearchUrl(query: GeoQuery): string {
    const url = new URL(KAKAO_KEYWORD_SEARCH_URL);
    url.searchParams.set("query", this.createKeyword(query));
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

  private toGeoCandidate(document: KakaoKeywordDocument): GeoCandidate {
    return {
      provider: this.name,
      providerPlaceId: document.id,
      placeName: document.place_name,
      address: document.address_name,
      coordinate: {
        lat: this.parseCoordinate(document.y),
        lng: this.parseCoordinate(document.x),
      },
      distance: this.parseDistance(document.distance),
      mapUrl: document.place_url,
      phone: document.phone || undefined,
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
