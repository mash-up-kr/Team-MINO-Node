import { Controller, Get, Param } from "@nestjs/common";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { jobIdSchema } from "./place.dto";
import { PlaceJobService } from "./place-job.service";
import type { PlaceJobResponse } from "./place-job.type";

@Controller("api/v1/place/jobs")
export class PlaceJobController {
  constructor(private readonly placeJobService: PlaceJobService) {}

  @Get(":jobId")
  async getJob(
    @Param("jobId", new ValibotPipe(jobIdSchema)) jobId: string,
  ): Promise<PlaceJobResponse> {
    return this.placeJobService.getJob(jobId);
  }
}
