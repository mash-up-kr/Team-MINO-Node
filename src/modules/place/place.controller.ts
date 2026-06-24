import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { GeocoderService } from "../../infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../infrastructures/geocoder/geocoder.type";
import {
  type CreatePlaceRequest,
  createPlaceRequestSchema,
  type TestGeocodeRequest,
  testGeocodeRequestSchema,
} from "./place.dto";
import { PlaceService } from "./place.service";
import type { PlaceCandidate } from "./place.type";

@Controller("api/v1/place")
export class PlaceController {
  constructor(
    private readonly placeService: PlaceService,
    // TODO: KakaoProvider 확인용 임시 의존성으로 전체 플로우 연동 후 제거합니다.
    private readonly geocoderService: GeocoderService,
  ) {}

  @Post("places")
  async createPlace(
    @Body(new ValibotPipe(createPlaceRequestSchema)) body: CreatePlaceRequest,
  ): Promise<PlaceCandidate[]> {
    switch (body.method) {
      case "instagram_url":
        return this.placeService.extractFromUrl(body.data.url);
      default:
        throw new Error(`Unsupported method: ${body.method}`);
    }
  }

  // TODO: KakaoProvider 확인용 임시 테스트 엔드포인트로 전체 플로우 연동 후 제거합니다.
  @Get("_test/geocode")
  async testGeocode(
    @Query(new ValibotPipe(testGeocodeRequestSchema)) query: TestGeocodeRequest,
  ): Promise<GeoCandidate[]> {
    return this.geocoderService.searchAll({
      placeName: query.placeName,
      areaName: query.areaName,
      areaType: query.areaType,
    });
  }
}
