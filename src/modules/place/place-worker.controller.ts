import { Body, Controller, Logger, Post, UseGuards } from "@nestjs/common";
import * as v from "valibot";
import { AppException } from "../../common/exceptions/app.exception";
import { CloudTasksGuard } from "../../common/guards/cloud-tasks.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { PlaceService } from "./place.service";
import { PlaceResultRepository } from "./place-result.repository";

const internalRequestSchema = v.object({
  url: v.pipe(v.string(), v.url(), v.regex(/instagram\.com/)),
});

type InternalRequest = v.InferOutput<typeof internalRequestSchema>;

/** Cloud Tasks 전용 Internal endpoint. 중간 상태나 결과를 HTTP 응답으로 반환하지 않는다. */
@Controller("internal/tasks")
@UseGuards(CloudTasksGuard)
export class PlaceWorkerController {
  private readonly logger = new Logger(PlaceWorkerController.name);

  constructor(
    private readonly placeService: PlaceService,
    private readonly placeResultRepository: PlaceResultRepository,
  ) {}

  @Post("pin-extraction")
  async process(
    @Body(new ValibotPipe(internalRequestSchema)) body: InternalRequest,
  ): Promise<void> {
    try {
      const matches = await this.placeService.extractFromUrl(body.url);
      await this.placeResultRepository.save(matches);
    } catch (error) {
      if (this.shouldAcknowledge(error)) {
        this.logger.warn(
          { err: error },
          "Non-retryable place extraction failure",
        );
        return;
      }
      throw error;
    }
  }

  private shouldAcknowledge(error: unknown): error is AppException {
    if (!(error instanceof AppException)) return false;
    return error.retryable ?? error.getStatus() < 500;
  }
}
