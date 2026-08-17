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
  type GooglePlaceDocument,
  googleSearchTextResponseSchema,
} from "./google.type";

const GOOGLE_SEARCH_TEXT_URL =
  "https://places.googleapis.com/v1/places:searchText";

/*
 * FieldMask가 곧 과금 티어라 실제로 쓰는 필드만 요청한다.
 */
const GOOGLE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
].join(",");

// Kakao(무료 쿼터)와 달리 요청당 과금이라 후보 수를 보수적으로 잡는다.
const GOOGLE_MAX_RESULT_COUNT = 5;
const GOOGLE_REQUEST_TIMEOUT_MS = 5000;

// 표시 이름을 받을 언어. 한국어 이름이 있으면 그걸 주고, 없으면 현지 표기로 떨어진다.
const GOOGLE_LANGUAGE_CODE = "ko";

@Injectable()
export class GoogleProvider implements GeocoderProvider {
  readonly name = "google" as const;

  constructor(private readonly configService: ConfigService<Env>) {}

  // Google Places는 전 세계를 색인하므로 국가로 거르지 않는다.
  supports(_query: GeoQuery): boolean {
    return true;
  }

  async search(query: GeoQuery): Promise<GeoCandidate[]> {
    const apiKey = this.configService.getOrThrow("GOOGLE_MAPS_API_KEY", {
      infer: true,
    });
    const body = await this.requestSearchText(query, apiKey);
    const parsed = v.safeParse(googleSearchTextResponseSchema, body);

    if (!parsed.success) {
      throw this.createInvalidResponseException();
    }

    return (parsed.output.places ?? []).map((document) =>
      this.toGeoCandidate(document),
    );
  }

  private async requestSearchText(
    query: GeoQuery,
    apiKey: string,
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(GOOGLE_SEARCH_TEXT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: this.createTextQuery(query),
          /*
           * 결과를 해당 국가 쪽으로 편향시킨다. 하드 필터가 아니라서 국경 근처나 동명 장소는
           * 다른 나라 결과가 섞일 수 있다.
           */
          regionCode: query.countryCode,
          languageCode: GOOGLE_LANGUAGE_CODE,
          maxResultCount: GOOGLE_MAX_RESULT_COUNT,
        }),
        signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw this.createRequestFailedException();
    }

    if (response.status === HttpStatus.TOO_MANY_REQUESTS) {
      throw new AppException(
        "GOOGLE_RATE_LIMITED",
        "구글 장소 검색 요청 한도를 초과했습니다.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!response.ok) {
      throw this.createRequestFailedException();
    }

    return this.parseJson(response);
  }

  /*
   * searchText는 주소와 상호명을 한 문자열로 함께 처리하므로 Kakao처럼 areaType에 따라
   * 주소 검색을 먼저 태우지 않는다. 왕복이 늘면 그만큼 요금이 붙는다.
   */
  private createTextQuery(query: GeoQuery): string {
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

  private toGeoCandidate(document: GooglePlaceDocument): GeoCandidate {
    return {
      provider: this.name,
      providerPlaceId: document.id,
      placeName: document.displayName.text,
      address: document.formattedAddress ?? "",
      coordinate: {
        lat: document.location.latitude,
        lng: document.location.longitude,
      },
      mapUrl: document.googleMapsUri,
      category: document.primaryTypeDisplayName?.text,
    };
  }

  private createRequestFailedException(): AppException {
    return new AppException(
      "GOOGLE_REQUEST_FAILED",
      "구글 장소 검색 요청에 실패했습니다.",
      HttpStatus.BAD_GATEWAY,
    );
  }

  private createInvalidResponseException(): AppException {
    return new AppException(
      "GOOGLE_RESPONSE_INVALID",
      "구글 장소 검색 응답 형식이 올바르지 않습니다.",
      HttpStatus.BAD_GATEWAY,
    );
  }
}
