import { Body, Controller, Post } from "@nestjs/common";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { type CreatePlaceRequest, createPlaceRequestSchema } from "./place.dto";
import { PlaceService } from "./place.service";
import type { PlaceCandidate } from "./place.type";

@Controller("api/v1/place")
export class PlaceController {
  constructor(private readonly placeService: PlaceService) {}

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
}
