import { HttpStatus, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { AppException } from "../../common/exceptions/app.exception";
import { DatabaseService } from "../../infrastructures/db/database.service";
import { TasksService } from "../../infrastructures/tasks/tasks.service";
import { placeJobs } from "./place.schema";
import { PlaceService } from "./place.service";
import { type PlaceJobResponse, toPlaceJobResponse } from "./place-job.type";

interface Failure {
  errorCode: string;
  message: string;
  httpStatus: number;
}

@Injectable()
export class PlaceJobService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tasksService: TasksService,
    private readonly placeService: PlaceService,
  ) {}

  async createJob(url: string): Promise<{ jobId: string }> {
    const { db } = this.databaseService;
    const [job] = await db
      .insert(placeJobs)
      .values({ url })
      .returning({ id: placeJobs.id });

    try {
      await this.tasksService.enqueuePlaceExtraction(job.id);
    } catch (error) {
      await db
        .update(placeJobs)
        .set({
          status: "failed",
          errorCode: "ENQUEUE_FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        .where(eq(placeJobs.id, job.id));

      throw new AppException(
        "ENQUEUE_FAILED",
        "작업을 큐에 등록하지 못했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }

    return { jobId: job.id };
  }

  async getJob(jobId: string): Promise<PlaceJobResponse> {
    const job = await this.findJobOrThrow(jobId);
    return toPlaceJobResponse(job);
  }

  /**
   * Cloud Tasks 워커 진입점. 재시도 필요한 실패(5xx)는 AppException을 던져 non-2xx
   * 응답으로 Cloud Tasks 재시도를 유도하고, 영구 실패(4xx)는 job을 failed로 남긴 채
   * 200을 반환해 재시도를 막는다.
   */
  async processJob(jobId: string): Promise<PlaceJobResponse> {
    const job = await this.findJobOrThrow(jobId);
    const { db } = this.databaseService;

    // 이미 끝난 job 재배달 시 idempotent no-op.
    if (job.status === "succeeded" || job.status === "failed") {
      return toPlaceJobResponse(job);
    }

    await db
      .update(placeJobs)
      .set({ status: "processing" })
      .where(eq(placeJobs.id, jobId));

    try {
      const result = await this.placeService.extractFromUrl(job.url);
      const [updated] = await db
        .update(placeJobs)
        .set({ status: "succeeded", result })
        .where(eq(placeJobs.id, jobId))
        .returning();

      return toPlaceJobResponse(updated);
    } catch (error) {
      const failure = this.toFailure(error);
      const [updated] = await db
        .update(placeJobs)
        .set({
          status: "failed",
          errorCode: failure.errorCode,
          errorMessage: failure.message,
        })
        .where(eq(placeJobs.id, jobId))
        .returning();

      if (failure.httpStatus >= 500) {
        throw new AppException(
          failure.errorCode,
          failure.message,
          failure.httpStatus,
        );
      }

      return toPlaceJobResponse(updated);
    }
  }

  private async findJobOrThrow(jobId: string) {
    const { db } = this.databaseService;
    const [job] = await db
      .select()
      .from(placeJobs)
      .where(eq(placeJobs.id, jobId))
      .limit(1);

    if (!job) {
      throw new AppException(
        "PLACE_JOB_NOT_FOUND",
        "존재하지 않는 job입니다.",
        HttpStatus.NOT_FOUND,
      );
    }

    return job;
  }

  private toFailure(error: unknown): Failure {
    if (error instanceof AppException) {
      return {
        errorCode: error.errorCode,
        message: error.message,
        httpStatus: error.getStatus(),
      };
    }

    return {
      errorCode: "WORKER_UNEXPECTED_ERROR",
      message: error instanceof Error ? error.message : String(error),
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }
}
