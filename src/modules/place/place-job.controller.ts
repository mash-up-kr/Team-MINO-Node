import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { type CreatePlaceRequest, createPlaceRequestSchema } from "./place.dto";
import { PlaceJobService } from "./place-job.service";
import type { PlaceJobResponse } from "./place-job.type";

@Controller("api/v1/place/jobs")
export class PlaceJobController {
  constructor(private readonly placeJobService: PlaceJobService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async createJob(
    @Body(new ValibotPipe(createPlaceRequestSchema)) body: CreatePlaceRequest,
  ): Promise<{ jobId: string }> {
    switch (body.method) {
      case "instagram_url":
        return this.placeJobService.createJob(body.data.url);
      default:
        throw new Error(`Unsupported method: ${body.method}`);
    }
  }

  @Get(":jobId")
  async getJob(@Param("jobId") jobId: string): Promise<PlaceJobResponse> {
    return this.placeJobService.getJob(jobId);
  }
}
