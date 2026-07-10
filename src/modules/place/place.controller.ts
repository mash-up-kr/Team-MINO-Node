import { Body, Controller, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  type CreatePlaceRequest,
  createPlaceRequestApiSchema,
  createPlaceRequestSchema,
  errorResponseApiSchema,
  placeMatchListResponseApiSchema,
} from "./place.dto";
import { PlaceService } from "./place.service";
import type { PlaceMatch } from "./place.type";

@ApiTags("place")
@Controller("api/v1/place")
export class PlaceController {
  constructor(private readonly placeService: PlaceService) {}

  @Post("places")
  @ApiOperation({
    summary: "인스타그램 URL에서 장소를 추출한 후 지오코딩한다",
    description:
      "scrap → AI extraction → geocoding fan-out",
  })
  @ApiBody({ schema: createPlaceRequestApiSchema })
  @ApiResponse({
    status: 201,
    description: "장소별 그룹(PlaceMatch[])",
    schema: placeMatchListResponseApiSchema,
  })
  @ApiResponse({
    status: 400,
    description: "요청 형식 오류 (VALIDATION_ERROR)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 502,
    description: "외부 연동 실패 (SCRAPER_REQUEST_FAILED / GEOCODER_ALL_FAILED)",
    schema: errorResponseApiSchema,
  })
  async createPlace(
    @Body(new ValibotPipe(createPlaceRequestSchema)) body: CreatePlaceRequest,
  ): Promise<PlaceMatch[]> {
    switch (body.method) {
      case "instagram_url":
        return this.placeService.extractFromUrl(body.data.url);
      default:
        throw new Error(`Unsupported method: ${body.method}`);
    }
  }
}
