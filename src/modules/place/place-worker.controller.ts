import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import * as v from "valibot";
import { AppException } from "../../common/exceptions/app.exception";
import { CloudTasksGuard } from "../../common/guards/cloud-tasks.guard";
import {
  type PinExtractionTask,
  pinExtractionTaskSchema,
} from "../pin/pin.dto";
import type { PlaceMatch } from "./place.type";

interface PlaceExtractor {
  extractFromUrl(url: string): Promise<PlaceMatch[]>;
}

interface PlaceResultStore {
  isActiveTaskTarget(task: PinExtractionTask): Promise<boolean>;
  save(
    task: PinExtractionTask,
    matches: PlaceMatch[],
  ): Promise<{
    readonly retryableFailures: number;
    readonly persistedPlaces: number;
  }>;
}

export const PLACE_EXTRACTOR = Symbol("PLACE_EXTRACTOR");
export const PLACE_RESULT_STORE = Symbol("PLACE_RESULT_STORE");

/** Cloud Tasks 전용 장소 추출 worker. 모든 영구 실패는 204로 소비한다. */
@Controller("api-internal/v1/tasks")
@UseGuards(CloudTasksGuard)
export class PlaceWorkerController {
  private readonly logger = new Logger(PlaceWorkerController.name);

  constructor(
    @Inject(PLACE_EXTRACTOR)
    private readonly placeService: PlaceExtractor,
    @Inject(PLACE_RESULT_STORE)
    private readonly placeResultRepository: PlaceResultStore,
  ) {}

  @Post("pins")
  @HttpCode(HttpStatus.NO_CONTENT)
  async process(@Body() rawBody: unknown): Promise<void> {
    const parsed = v.safeParse(pinExtractionTaskSchema, rawBody);
    if (!parsed.success) {
      this.logger.warn("Malformed pin extraction task acknowledged");
      return;
    }
    const task: PinExtractionTask = parsed.output;

    if (!(await this.placeResultRepository.isActiveTaskTarget(task))) {
      this.logger.warn(
        {
          roomId: task.roomId,
          sourceId: task.sourceId,
          createdBy: task.createdBy,
        },
        "Stale pin extraction task acknowledged",
      );
      return;
    }

    try {
      const matches = await this.placeService.extractFromUrl(task.url);
      const result = await this.placeResultRepository.save(task, matches);
      if (result.retryableFailures > 0) {
        throw new ServiceUnavailableException(
          "일부 장소 검색이 일시적으로 실패했습니다.",
        );
      }
    } catch (error) {
      if (this.shouldAcknowledge(error)) {
        this.logger.warn(
          { err: error },
          "Non-retryable place extraction failure acknowledged",
        );
        return;
      }
      const response = this.toRetryableResponse(error);
      this.logger.warn(
        {
          err: error,
          roomId: task.roomId,
          sourceId: task.sourceId,
          createdBy: task.createdBy,
          errorCode:
            error instanceof AppException
              ? error.errorCode
              : "UNEXPECTED_ERROR",
          responseStatus: response.getStatus(),
        },
        "Retryable place extraction failure; Cloud Tasks will redeliver",
      );
      throw response;
    }
  }

  private shouldAcknowledge(error: unknown): boolean {
    if (!(error instanceof AppException)) return false;
    const shouldRetry = error.retryable ?? error.getStatus() >= 500;
    return !shouldRetry;
  }

  private toRetryableResponse(error: unknown): ServiceUnavailableException {
    if (error instanceof AppException) {
      const response = error.getResponse();
      return new ServiceUnavailableException(response, { cause: error });
    }
    if (error instanceof HttpException) {
      return new ServiceUnavailableException(error.getResponse(), {
        cause: error,
      });
    }
    return new ServiceUnavailableException("장소 추출 작업을 재시도합니다.", {
      cause: error,
    });
  }
}
