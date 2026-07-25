import { Controller, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { CloudTasksGuard } from "../../common/guards/cloud-tasks.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { jobIdSchema } from "./place.dto";
import { PlaceJobService } from "./place-job.service";
import type { PlaceJobResponse } from "./place-job.type";

/** Cloud Tasks 전용 워커 엔드포인트. CloudTasksGuard가 OIDC 토큰을 검증한다. */
@Controller("internal/place/jobs")
@UseGuards(CloudTasksGuard)
export class PlaceJobWorkerController {
  constructor(private readonly placeJobService: PlaceJobService) {}

  @Post(":jobId/process")
  async process(
    @Param("jobId", new ValibotPipe(jobIdSchema)) jobId: string,
    @Headers("x-cloudtasks-taskretrycount") retryCountHeader = "0",
  ): Promise<PlaceJobResponse> {
    const retryCount = Number.parseInt(retryCountHeader, 10);
    return this.placeJobService.processJob(
      jobId,
      Number.isNaN(retryCount) ? 0 : retryCount,
    );
  }
}
