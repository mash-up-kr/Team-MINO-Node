import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import * as v from "valibot";
import { AppException } from "../../common/exceptions/app.exception";
import { CloudTasksGuard } from "../../common/guards/cloud-tasks.guard";
import {
  type PinExtractionTask,
  pinExtractionTaskSchema,
} from "../../common/tasks/pin-extraction-task.dto";
import type { Env } from "../../config/env.schema";
import { NotificationService } from "../notification/notification.service";
import type {
  DuplicatedPlace,
  PlaceExtraction,
  PlaceMatch,
} from "./place.type";

interface PlaceExtractor {
  extractFromUrl(url: string): Promise<PlaceExtraction>;
}

interface PlaceResultStore {
  activeRoomIdsForTask(task: PinExtractionTask): Promise<string[]>;
  save(
    task: PinExtractionTask,
    matches: PlaceMatch[],
    images: string[],
  ): Promise<{
    readonly retryableFailures: number;
    readonly persistedPlaces: number;
    readonly duplicatedPlaces: readonly DuplicatedPlace[];
  }>;
}

export const PLACE_EXTRACTOR = Symbol("PLACE_EXTRACTOR");
export const PLACE_RESULT_STORE = Symbol("PLACE_RESULT_STORE");

/** Cloud Tasks 전용 장소 추출 worker. 모든 영구 실패는 204로 소비한다. */
@ApiTags("Internal")
@Controller("api-internal/v1/tasks")
@UseGuards(CloudTasksGuard)
export class PlaceWorkerController {
  private readonly logger = new Logger(PlaceWorkerController.name);
  private readonly maxAttempts: number;

  constructor(
    @Inject(PLACE_EXTRACTOR)
    private readonly placeService: PlaceExtractor,
    @Inject(PLACE_RESULT_STORE)
    private readonly placeResultRepository: PlaceResultStore,
    private readonly notificationService: NotificationService,
    configService: ConfigService<Env>,
  ) {
    this.maxAttempts = configService.getOrThrow("CLOUD_TASKS_MAX_ATTEMPTS", {
      infer: true,
    });
  }

  @Post("pins")
  @ApiOperation({
    summary: "Cloud Tasks 전용 내부 작업 처리 API",
    description: "클라이언트에서 직접 호출하지 않음",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async process(
    @Body() rawBody: unknown,
    @Headers("x-cloudtasks-taskretrycount") retryCountHeader?: string,
  ): Promise<void> {
    const parsed = v.safeParse(pinExtractionTaskSchema, rawBody);
    if (!parsed.success) {
      this.logger.warn("Malformed pin extraction task acknowledged");
      return;
    }
    const task: PinExtractionTask = parsed.output;

    const activeRoomIds =
      await this.placeResultRepository.activeRoomIdsForTask(task);
    if (activeRoomIds.length === 0) {
      this.logger.warn(
        {
          roomIds: task.roomIds,
          sourceId: task.sourceId,
          createdBy: task.createdBy,
        },
        "Stale pin extraction task acknowledged",
      );
      return;
    }
    const activeTask: PinExtractionTask = { ...task, roomIds: activeRoomIds };

    try {
      const { matches, images } = await this.placeService.extractFromUrl(
        activeTask.url,
      );
      const result = await this.placeResultRepository.save(
        activeTask,
        matches,
        images,
      );
      await this.notifyDuplicated(activeTask, result.duplicatedPlaces);
      if (result.retryableFailures > 0) {
        throw new ServiceUnavailableException(
          "일부 장소 검색이 일시적으로 실패했습니다.",
        );
      }
      if (result.persistedPlaces === 0) {
        await this.notifyFailed(activeTask);
      }
    } catch (error) {
      if (this.shouldAcknowledge(error)) {
        this.logger.warn(
          { err: error },
          "Non-retryable place extraction failure acknowledged",
        );
        await this.notifyFailed(activeTask);
        return;
      }
      // 재시도 소진은 Cloud Tasks가 조용히 버려 여기가 마지막 기회다. retryCount는 0부터다.
      if (Number(retryCountHeader ?? 0) >= this.maxAttempts - 1) {
        await this.notifyFailed(activeTask);
      }
      const response = this.toRetryableResponse(error);
      this.logger.warn(
        {
          err: error,
          roomIds: activeTask.roomIds,
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

  private async notifyDuplicated(
    task: PinExtractionTask,
    duplicatedPlaces: readonly DuplicatedPlace[],
  ): Promise<void> {
    await Promise.all(
      duplicatedPlaces.map((place) =>
        this.notificationService.recordAndNotifyUser({
          recipientId: task.createdBy,
          type: "PIN_DUPLICATED",
          typeLabel: "이미 저장해둔 곳이에요",
          targetName: place.placeName,
          thumbnailUrl: place.thumbnailUrl ?? undefined,
          payload: { placeId: place.placeId, pinId: place.pinId },
          // enqueuedAt이 있어야 같은 글을 다시 저장했을 때 별개 행으로 남는다(TS-052).
          key: `PIN_DUPLICATED:${task.sourceId}:${task.enqueuedAt}:${place.placeId}`,
        }),
      ),
    );
  }

  private async notifyFailed(task: PinExtractionTask): Promise<void> {
    await this.notificationService.recordAndNotifyUser({
      recipientId: task.createdBy,
      type: "SAVE_FAILED",
      typeLabel: "장소를 저장하지 못했어요.",
      targetName: "잠시 후 다시 시도해주세요",
      key: `SAVE_FAILED:${task.sourceId}:${task.enqueuedAt}`,
    });
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
