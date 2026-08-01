import { beforeEach, describe, expect, it, mock } from "bun:test";
import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { TasksService } from "../../infrastructures/tasks/tasks.service";
import type { PlaceService } from "./place.service";
import {
  type PlaceJobRepository,
  type ReusableJob,
} from "./place-job.repository";
import type { PlaceJob } from "./place-job.schema";
import { PlaceJobService } from "./place-job.service";

const URL = "https://www.instagram.com/p/abc123/";
const SHORTCODE = "abc123";
const JOB_ID = "11111111-1111-1111-1111-111111111111";

function makeJob(overrides: Partial<PlaceJob> = {}): PlaceJob {
  return {
    id: JOB_ID,
    url: URL,
    shortcode: SHORTCODE,
    status: "pending",
    attempts: 1,
    result: null,
    errorCode: null,
    errorMessage: null,
    processingLeaseExpiresAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeHarness(maxAttempts = 10) {
  const repository = {
    tryInsert: mock(
      async (): Promise<{ id: string } | null> => ({
        id: JOB_ID,
      }),
    ),
    findReusableByShortcode: mock(
      async (): Promise<ReusableJob | undefined> => undefined,
    ),
    tryReserveStaleRescue: mock(async (): Promise<boolean> => true),
    findById: mock(async (): Promise<PlaceJob | undefined> => makeJob()),
    claimForProcessing: mock(
      async (): Promise<PlaceJob | undefined> =>
        makeJob({
          status: "processing",
          processingLeaseExpiresAt: new Date("2026-01-01T00:10:00Z"),
        }),
    ),
    markSucceeded: mock(
      async (): Promise<PlaceJob | undefined> =>
        makeJob({ status: "succeeded" }),
    ),
    markRetryable: mock(
      async (): Promise<PlaceJob | undefined> => makeJob({ status: "pending" }),
    ),
    markFailed: mock(
      async (): Promise<PlaceJob | undefined> => makeJob({ status: "failed" }),
    ),
    markFailedBeforeClaim: mock(
      async (): Promise<PlaceJob | undefined> => makeJob({ status: "failed" }),
    ),
  };
  const tasksService = {
    enqueuePlaceExtraction: mock(async () => {}),
    getMaxAttempts: mock(async () => maxAttempts),
  };
  const placeService = { extractFromUrl: mock(async () => []) };

  const service = new PlaceJobService(
    repository as unknown as PlaceJobRepository,
    tasksService as unknown as TasksService,
    placeService as unknown as PlaceService,
  );

  return { service, repository, tasksService, placeService };
}

describe("PlaceJobService.createJob", () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    harness = makeHarness();
  });

  it("새 job을 만들고 enqueue한 뒤 jobId를 반환한다", async () => {
    const result = await harness.service.createJob(URL);

    expect(result).toEqual({ jobId: JOB_ID });
    expect(harness.repository.tryInsert).toHaveBeenCalledWith(URL, SHORTCODE);
    expect(harness.tasksService.enqueuePlaceExtraction).toHaveBeenCalledWith(
      JOB_ID,
    );
  });

  it("잘못된 URL은 shortcode 추출 단계에서 그대로 전파한다(job 미생성)", async () => {
    await expect(
      harness.service.createJob("https://evil.com/p/x"),
    ).rejects.toThrow("지원하지 않는 인스타그램 URL");
    expect(harness.repository.tryInsert).not.toHaveBeenCalled();
  });

  it("재사용 가능한 job이 있으면 INSERT/enqueue 없이 그 jobId를 돌려준다(early return)", async () => {
    const existingId = "22222222-2222-2222-2222-222222222222";
    harness.repository.findReusableByShortcode.mockResolvedValue({
      id: existingId,
      status: "succeeded",
      updatedAt: new Date(),
      processingLeaseExpiresAt: null,
    });

    const result = await harness.service.createJob(URL);

    expect(result).toEqual({ jobId: existingId });
    expect(harness.repository.tryInsert).not.toHaveBeenCalled();
    expect(harness.tasksService.enqueuePlaceExtraction).not.toHaveBeenCalled();
  });

  it("오래 방치된 pending job을 재사용할 때 태스크를 다시 enqueue한다(유실 복구)", async () => {
    const staleId = "33333333-3333-3333-3333-333333333333";
    harness.repository.findReusableByShortcode.mockResolvedValue({
      id: staleId,
      status: "pending",
      updatedAt: new Date(Date.now() - 11 * 60 * 1000),
      processingLeaseExpiresAt: null,
    });

    const result = await harness.service.createJob(URL);

    expect(result).toEqual({ jobId: staleId });
    expect(harness.tasksService.enqueuePlaceExtraction).toHaveBeenCalledWith(
      staleId,
    );
    expect(harness.repository.tryReserveStaleRescue).toHaveBeenCalledTimes(1);
  });

  it("방금 만들어진 pending job 재사용은 재enqueue하지 않는다", async () => {
    harness.repository.findReusableByShortcode.mockResolvedValue({
      id: JOB_ID,
      status: "pending",
      updatedAt: new Date(),
      processingLeaseExpiresAt: null,
    });

    await harness.service.createJob(URL);

    expect(harness.tasksService.enqueuePlaceExtraction).not.toHaveBeenCalled();
    expect(harness.repository.tryReserveStaleRescue).not.toHaveBeenCalled();
  });

  it("lease가 만료된 processing job은 task를 다시 enqueue한다", async () => {
    harness.repository.findReusableByShortcode.mockResolvedValue({
      id: JOB_ID,
      status: "processing",
      updatedAt: new Date(),
      processingLeaseExpiresAt: new Date(Date.now() - 60 * 1000),
    });

    await harness.service.createJob(URL);

    expect(harness.repository.tryReserveStaleRescue).toHaveBeenCalledTimes(1);
    expect(harness.tasksService.enqueuePlaceExtraction).toHaveBeenCalledWith(
      JOB_ID,
    );
  });

  it("다른 요청이 stale rescue를 먼저 선점하면 중복 enqueue하지 않는다", async () => {
    harness.repository.findReusableByShortcode.mockResolvedValue({
      id: JOB_ID,
      status: "pending",
      updatedAt: new Date(Date.now() - 11 * 60 * 1000),
      processingLeaseExpiresAt: null,
    });
    harness.repository.tryReserveStaleRescue.mockResolvedValue(false);

    await harness.service.createJob(URL);

    expect(harness.tasksService.enqueuePlaceExtraction).not.toHaveBeenCalled();
  });

  it("유실 복구 enqueue가 실패해도 기존 jobId 반환은 막지 않는다(best-effort)", async () => {
    harness.repository.findReusableByShortcode.mockResolvedValue({
      id: JOB_ID,
      status: "pending",
      updatedAt: new Date(Date.now() - 11 * 60 * 1000),
      processingLeaseExpiresAt: null,
    });
    harness.tasksService.enqueuePlaceExtraction.mockRejectedValue(
      new Error("queue unavailable"),
    );

    const result = await harness.service.createJob(URL);

    expect(result).toEqual({ jobId: JOB_ID });
  });

  it("조회와 삽입 사이에 다른 요청이 끼어들면 재조회로 그 job을 재사용한다", async () => {
    const racedId = "44444444-4444-4444-4444-444444444444";
    harness.repository.findReusableByShortcode
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: racedId,
        status: "pending",
        updatedAt: new Date(),
        processingLeaseExpiresAt: null,
      });
    harness.repository.tryInsert.mockResolvedValueOnce(null);

    const result = await harness.service.createJob(URL);

    expect(result).toEqual({ jobId: racedId });
    expect(harness.repository.tryInsert).toHaveBeenCalledTimes(1);
    expect(harness.tasksService.enqueuePlaceExtraction).not.toHaveBeenCalled();
  });

  it("조회↔삽입이 상한까지 계속 어긋나면 409를 던진다", async () => {
    harness.repository.findReusableByShortcode.mockResolvedValue(undefined);
    harness.repository.tryInsert.mockResolvedValue(null);

    await expect(harness.service.createJob(URL)).rejects.toMatchObject({
      errorCode: "PLACE_JOB_CONFLICT",
    });
  });

  it("enqueue 실패 시 job을 terminal failed로 남기고 502를 던진다", async () => {
    harness.tasksService.enqueuePlaceExtraction.mockRejectedValue(
      new Error("queue unavailable"),
    );

    await expect(harness.service.createJob(URL)).rejects.toMatchObject({
      errorCode: "ENQUEUE_FAILED",
    });
    expect(harness.repository.markFailedBeforeClaim).toHaveBeenCalledWith(
      JOB_ID,
      "ENQUEUE_FAILED",
      "queue unavailable",
    );
  });
});

describe("PlaceJobService.getJob", () => {
  it("존재하는 job의 응답을 반환한다", async () => {
    const { service } = makeHarness();

    const response = await service.getJob(JOB_ID);

    expect(response.jobId).toBe(JOB_ID);
    expect(response.status).toBe("pending");
  });

  it("DB의 내부 진단 메시지를 공개 응답에 그대로 노출하지 않는다", async () => {
    const harness = makeHarness();
    harness.repository.findById.mockResolvedValue(
      makeJob({
        status: "failed",
        errorCode: "WORKER_UNEXPECTED_ERROR",
        errorMessage: "provider secret-token internal-url",
      }),
    );

    const response = await harness.service.getJob(JOB_ID);

    expect(response.errorMessage).toBe("장소 추출 작업에 실패했습니다.");
    expect(response.errorMessage).not.toContain("secret-token");
  });

  it("없는 job이면 404를 던진다", async () => {
    const harness = makeHarness();
    harness.repository.findById.mockResolvedValue(undefined);

    await expect(harness.service.getJob(JOB_ID)).rejects.toMatchObject({
      errorCode: "PLACE_JOB_NOT_FOUND",
    });
  });
});

describe("PlaceJobService.processJob", () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    harness = makeHarness();
  });

  it("claim에 성공하면 추출을 실행하고 succeeded로 남긴다", async () => {
    const candidates = [{ provider: "kakao" }];
    harness.placeService.extractFromUrl.mockResolvedValue(
      candidates as never[],
    );

    const response = await harness.service.processJob(JOB_ID);

    expect(response.status).toBe("succeeded");
    expect(harness.placeService.extractFromUrl).toHaveBeenCalledWith(URL);
    expect(harness.repository.markSucceeded).toHaveBeenCalledWith(
      JOB_ID,
      expect.any(Date),
      candidates,
    );
    expect(harness.tasksService.getMaxAttempts).not.toHaveBeenCalled();
  });

  it("재시도 실패 뒤 큐 설정 조회가 실패하면 failed로 종결하고 재배달을 막는다", async () => {
    harness.placeService.extractFromUrl.mockRejectedValue(
      new AppException("SCRAPE_FAILED", "인스타그램 응답 오류", 502),
    );
    harness.tasksService.getMaxAttempts.mockRejectedValue(
      new Error("queue unavailable"),
    );
    harness.repository.markFailed.mockResolvedValue(
      makeJob({
        status: "failed",
        errorCode: "CLOUD_TASKS_CONFIG_UNAVAILABLE",
        errorMessage: "queue unavailable",
      }),
    );

    await expect(harness.service.processJob(JOB_ID)).resolves.toMatchObject({
      status: "failed",
      errorCode: "CLOUD_TASKS_CONFIG_UNAVAILABLE",
      errorMessage: "장소 추출 작업에 실패했습니다.",
    });
    expect(harness.repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.any(Date),
      "CLOUD_TASKS_CONFIG_UNAVAILABLE",
      "queue unavailable",
    );
    expect(harness.repository.markRetryable).not.toHaveBeenCalled();
  });

  it("성공 상태 전이가 0건이면 현재 job을 반환한다", async () => {
    harness.repository.markSucceeded.mockResolvedValue(undefined);
    harness.repository.findById.mockResolvedValue(
      makeJob({ status: "processing" }),
    );

    await expect(harness.service.processJob(JOB_ID)).resolves.toMatchObject({
      status: "processing",
    });
  });

  it("claim 실패 후 terminal이면 추출 없이 현재 상태를 돌려준다", async () => {
    harness.repository.claimForProcessing.mockResolvedValue(undefined);
    harness.repository.findById.mockResolvedValue(
      makeJob({ status: "succeeded" }),
    );

    const response = await harness.service.processJob(JOB_ID);

    expect(response.status).toBe("succeeded");
    expect(harness.placeService.extractFromUrl).not.toHaveBeenCalled();
    expect(harness.tasksService.getMaxAttempts).not.toHaveBeenCalled();
  });

  it("미만료 processing lease와 충돌하면 non-2xx 재시도 신호를 보낸다", async () => {
    harness.repository.claimForProcessing.mockResolvedValue(undefined);
    harness.repository.findById.mockResolvedValue(
      makeJob({
        status: "processing",
        processingLeaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      }),
    );

    await expect(harness.service.processJob(JOB_ID)).rejects.toMatchObject({
      errorCode: "PLACE_JOB_BUSY",
      status: HttpStatus.CONFLICT,
    });
    expect(harness.placeService.extractFromUrl).not.toHaveBeenCalled();
    expect(harness.tasksService.getMaxAttempts).not.toHaveBeenCalled();
  });

  it("claim 실패 + 존재하지 않는 job이면 404를 던진다", async () => {
    harness.repository.claimForProcessing.mockResolvedValue(undefined);
    harness.repository.findById.mockResolvedValue(undefined);

    await expect(harness.service.processJob(JOB_ID)).rejects.toMatchObject({
      errorCode: "PLACE_JOB_NOT_FOUND",
    });
  });

  it("5xx 실패는 pending으로 되돌리고 non-2xx로 재시도를 유도한다", async () => {
    harness.placeService.extractFromUrl.mockRejectedValue(
      new AppException(
        "SCRAPE_FAILED",
        "인스타그램 응답 오류",
        HttpStatus.BAD_GATEWAY,
      ),
    );

    await expect(harness.service.processJob(JOB_ID)).rejects.toMatchObject({
      errorCode: "SCRAPE_FAILED",
    });
    expect(harness.repository.markRetryable).toHaveBeenCalledWith(
      JOB_ID,
      expect.any(Date),
      "SCRAPE_FAILED",
      "인스타그램 응답 오류",
    );
  });

  it("재시도 상태 전이가 0건이면 현재 job을 반환하고 재시도 신호를 보내지 않는다", async () => {
    harness.placeService.extractFromUrl.mockRejectedValue(
      new AppException("SCRAPE_FAILED", "인스타그램 응답 오류", 502),
    );
    harness.repository.markRetryable.mockResolvedValue(undefined);
    harness.repository.findById.mockResolvedValue(
      makeJob({ status: "processing" }),
    );

    await expect(harness.service.processJob(JOB_ID)).resolves.toMatchObject({
      status: "processing",
    });
  });

  it("retryable로 명시된 4xx(비결정적 AI 응답)는 pending으로 되돌리고 재시도를 유도한다", async () => {
    harness.placeService.extractFromUrl.mockRejectedValue(
      new AppException(
        "AI_SCHEMA_MISMATCH",
        "AI 응답이 스키마와 일치하지 않습니다.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        { retryable: true },
      ),
    );

    await expect(harness.service.processJob(JOB_ID)).rejects.toMatchObject({
      errorCode: "AI_SCHEMA_MISMATCH",
    });
    expect(harness.repository.markRetryable).toHaveBeenCalledWith(
      JOB_ID,
      expect.any(Date),
      "AI_SCHEMA_MISMATCH",
      "AI 응답이 스키마와 일치하지 않습니다.",
    );
    expect(harness.repository.markFailed).not.toHaveBeenCalled();
  });

  it("예상 밖 오류는 500으로 간주해 pending으로 되돌리고 던진다", async () => {
    harness.placeService.extractFromUrl.mockRejectedValue(
      new Error("boom\nsecret-token"),
    );

    await expect(harness.service.processJob(JOB_ID)).rejects.toMatchObject({
      errorCode: "WORKER_UNEXPECTED_ERROR",
    });
    // 진단 메시지는 개행이 공백으로 접혀 저장된다.
    expect(harness.repository.markRetryable).toHaveBeenCalledWith(
      JOB_ID,
      expect.any(Date),
      "WORKER_UNEXPECTED_ERROR",
      "boom secret-token",
    );
  });

  it("Cloud Tasks 마지막 시도면 retryable 실패도 terminal failed로 종결한다", async () => {
    harness.repository.claimForProcessing.mockResolvedValue(
      makeJob({
        status: "processing",
        attempts: 1,
        processingLeaseExpiresAt: new Date("2026-01-01T00:10:00Z"),
      }),
    );
    harness.placeService.extractFromUrl.mockRejectedValue(
      new AppException(
        "SCRAPE_FAILED",
        "인스타그램 응답 오류",
        HttpStatus.BAD_GATEWAY,
      ),
    );

    const response = await harness.service.processJob(JOB_ID, 9);

    expect(response.status).toBe("failed");
    expect(harness.repository.markRetryable).not.toHaveBeenCalled();
    expect(harness.repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.any(Date),
      "SCRAPE_FAILED",
      "인스타그램 응답 오류",
    );
  });

  it("새 task로 retry count가 초기화돼도 job 누적 시도가 상한이면 failed로 종결한다", async () => {
    harness.repository.claimForProcessing.mockResolvedValue(
      makeJob({
        status: "processing",
        attempts: 10,
        processingLeaseExpiresAt: new Date("2026-01-01T00:10:00Z"),
      }),
    );
    harness.placeService.extractFromUrl.mockRejectedValue(
      new AppException(
        "SCRAPE_FAILED",
        "인스타그램 응답 오류",
        HttpStatus.BAD_GATEWAY,
      ),
    );

    const response = await harness.service.processJob(JOB_ID, 0);

    expect(response.status).toBe("failed");
    expect(harness.repository.markRetryable).not.toHaveBeenCalled();
    expect(harness.repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.any(Date),
      "SCRAPE_FAILED",
      "인스타그램 응답 오류",
    );
  });

  it("4xx 실패는 terminal failed로 남기고 2xx 응답으로 재시도를 막는다", async () => {
    harness.placeService.extractFromUrl.mockRejectedValue(
      new AppException(
        "INVALID_INSTAGRAM_URL",
        "지원하지 않는 인스타그램 URL 입니다.",
        HttpStatus.BAD_REQUEST,
      ),
    );

    const response = await harness.service.processJob(JOB_ID);

    expect(response.status).toBe("failed");
    expect(harness.repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.any(Date),
      "INVALID_INSTAGRAM_URL",
      "지원하지 않는 인스타그램 URL 입니다.",
    );
    expect(harness.tasksService.getMaxAttempts).not.toHaveBeenCalled();
  });
});
