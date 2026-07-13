import { beforeEach, describe, expect, it, mock } from "bun:test";
import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { ScraperService } from "../../infrastructures/scraper/scraper.service";
import type { TasksService } from "../../infrastructures/tasks/tasks.service";
import type { PlaceJob } from "./place.schema";
import type { PlaceService } from "./place.service";
import type { PlaceJobRepository } from "./place-job.repository";
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

type Reusable = { id: string; status: PlaceJob["status"]; updatedAt: Date };

function makeHarness() {
  const repository = {
    tryInsert: mock(
      async (): Promise<{ id: string } | null> => ({
        id: JOB_ID,
      }),
    ),
    findReusableByShortcode: mock(
      async (): Promise<Reusable | undefined> => undefined,
    ),
    findById: mock(async (): Promise<PlaceJob | undefined> => makeJob()),
    claimForProcessing: mock(
      async (): Promise<PlaceJob | undefined> =>
        makeJob({ status: "processing" }),
    ),
    markSucceeded: mock(async () => makeJob({ status: "succeeded" })),
    markRetryable: mock(async () => makeJob({ status: "pending" })),
    markFailed: mock(async () => makeJob({ status: "failed" })),
  };
  const tasksService = { enqueuePlaceExtraction: mock(async () => {}) };
  const placeService = { extractFromUrl: mock(async () => []) };
  const scraperService = { extractShortcode: mock(() => SHORTCODE) };

  const service = new PlaceJobService(
    repository as unknown as PlaceJobRepository,
    tasksService as unknown as TasksService,
    placeService as unknown as PlaceService,
    scraperService as unknown as ScraperService,
  );

  return { service, repository, tasksService, placeService, scraperService };
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
    harness.scraperService.extractShortcode.mockImplementation(() => {
      throw new AppException(
        "INVALID_INSTAGRAM_URL",
        "지원하지 않는 인스타그램 URL 입니다.",
        HttpStatus.BAD_REQUEST,
      );
    });

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
    });

    const result = await harness.service.createJob(URL);

    expect(result).toEqual({ jobId: staleId });
    expect(harness.tasksService.enqueuePlaceExtraction).toHaveBeenCalledWith(
      staleId,
    );
  });

  it("방금 만들어진 pending job 재사용은 재enqueue하지 않는다", async () => {
    harness.repository.findReusableByShortcode.mockResolvedValue({
      id: JOB_ID,
      status: "pending",
      updatedAt: new Date(),
    });

    await harness.service.createJob(URL);

    expect(harness.tasksService.enqueuePlaceExtraction).not.toHaveBeenCalled();
  });

  it("유실 복구 enqueue가 실패해도 기존 jobId 반환은 막지 않는다(best-effort)", async () => {
    harness.repository.findReusableByShortcode.mockResolvedValue({
      id: JOB_ID,
      status: "pending",
      updatedAt: new Date(Date.now() - 11 * 60 * 1000),
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
    expect(harness.repository.markFailed).toHaveBeenCalledWith(
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
      candidates,
    );
  });

  it("claim 실패(terminal/미만료 lease)면 추출 없이 현재 상태를 돌려준다", async () => {
    harness.repository.claimForProcessing.mockResolvedValue(undefined);
    harness.repository.findById.mockResolvedValue(
      makeJob({ status: "succeeded" }),
    );

    const response = await harness.service.processJob(JOB_ID);

    expect(response.status).toBe("succeeded");
    expect(harness.placeService.extractFromUrl).not.toHaveBeenCalled();
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
      "SCRAPE_FAILED",
      "인스타그램 응답 오류",
    );
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
      "WORKER_UNEXPECTED_ERROR",
      "boom secret-token",
    );
  });

  it("누적 시도 상한에 닿으면 재시도 가치가 있는 실패도 terminal failed로 종결한다", async () => {
    harness.repository.claimForProcessing.mockResolvedValue(
      makeJob({ status: "processing", attempts: 10 }),
    );
    harness.placeService.extractFromUrl.mockRejectedValue(
      new AppException(
        "SCRAPE_FAILED",
        "인스타그램 응답 오류",
        HttpStatus.BAD_GATEWAY,
      ),
    );

    const response = await harness.service.processJob(JOB_ID);

    expect(response.status).toBe("failed");
    expect(harness.repository.markRetryable).not.toHaveBeenCalled();
    expect(harness.repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
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
      "INVALID_INSTAGRAM_URL",
      "지원하지 않는 인스타그램 URL 입니다.",
    );
  });
});
