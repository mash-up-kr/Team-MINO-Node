import "reflect-metadata";
import { describe, expect, it, jest } from "bun:test";
import { AppException } from "../../common/exceptions/app.exception";
import type { DatabaseService } from "../../infrastructures/db/database.service";
import type { TasksService } from "../../infrastructures/tasks/tasks.service";
import type { PlaceJob } from "./place.schema";
import type { PlaceService } from "./place.service";
import type { PlaceCandidate } from "./place.type";
import { PlaceJobService } from "./place-job.service";

/**
 * drizzle 쿼리 빌더(.values/.set/.from/.where/.limit/.returning ...)는 전부 체이닝되다가
 * await되는 thenable이다. 어떤 메서드가 호출되든 같은 프록시를 반환하고, await 시점에만
 * 미리 정해둔 값으로 resolve하는 걸로 흉내낸다.
 */
function chainable(result: unknown): unknown {
  const proxy: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

function createDbMock(overrides: {
  insertResult?: unknown;
  selectResult?: unknown;
  updateResult?: unknown;
}) {
  const insert = jest.fn(() => chainable(overrides.insertResult));
  const select = jest.fn(() => chainable(overrides.selectResult));
  const update = jest.fn(() => chainable(overrides.updateResult));
  return { insert, select, update };
}

function makeJob(overrides: Partial<PlaceJob> = {}): PlaceJob {
  return {
    id: "job-1",
    url: "https://www.instagram.com/p/abc123/",
    shortcode: null,
    status: "pending",
    result: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

function makeCandidate(): PlaceCandidate {
  return {
    provider: "kakao",
    placeName: "어니언 성수",
    address: "서울 성동구 아차산로 8",
    coordinate: { lat: 37.5445, lng: 127.0559 },
  };
}

function createService(db: ReturnType<typeof createDbMock>) {
  const databaseService = { db } as unknown as DatabaseService;
  const tasksService = {
    enqueuePlaceExtraction: jest.fn(),
  } as unknown as TasksService & {
    enqueuePlaceExtraction: ReturnType<typeof jest.fn>;
  };
  const placeService = {
    extractFromUrl: jest.fn(),
  } as unknown as PlaceService & {
    extractFromUrl: ReturnType<typeof jest.fn>;
  };
  const service = new PlaceJobService(
    databaseService,
    tasksService,
    placeService,
  );
  return { service, tasksService, placeService };
}

describe("PlaceJobService", () => {
  describe("createJob", () => {
    it("job을 만들고 enqueue한 뒤 jobId를 반환한다", async () => {
      const db = createDbMock({ insertResult: [{ id: "job-1" }] });
      const { service, tasksService } = createService(db);
      (
        tasksService.enqueuePlaceExtraction as ReturnType<typeof jest.fn>
      ).mockResolvedValue(undefined);

      const result = await service.createJob(
        "https://www.instagram.com/p/abc123/",
      );

      expect(result).toEqual({ jobId: "job-1" });
      expect(tasksService.enqueuePlaceExtraction).toHaveBeenCalledWith("job-1");
    });

    it("enqueue가 실패하면 job을 failed로 남기고 AppException을 던진다", async () => {
      const db = createDbMock({ insertResult: [{ id: "job-1" }] });
      const { service, tasksService } = createService(db);
      (
        tasksService.enqueuePlaceExtraction as ReturnType<typeof jest.fn>
      ).mockRejectedValue(new Error("Cloud Tasks unavailable"));

      let caught: unknown;
      try {
        await service.createJob("https://www.instagram.com/p/abc123/");
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(AppException);
      expect((caught as AppException).errorCode).toBe("ENQUEUE_FAILED");
      expect((caught as AppException).getStatus()).toBe(502);
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe("getJob", () => {
    it("존재하는 job을 응답 형태로 반환한다", async () => {
      const job = makeJob({ status: "succeeded", result: [makeCandidate()] });
      const db = createDbMock({ selectResult: [job] });
      const { service } = createService(db);

      const result = await service.getJob("job-1");

      expect(result.jobId).toBe("job-1");
      expect(result.status).toBe("succeeded");
      expect(result.result).toEqual([makeCandidate()]);
    });

    it("존재하지 않으면 404 AppException을 던진다", async () => {
      const db = createDbMock({ selectResult: [] });
      const { service } = createService(db);

      let caught: unknown;
      try {
        await service.getJob("missing");
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(AppException);
      expect((caught as AppException).errorCode).toBe("PLACE_JOB_NOT_FOUND");
      expect((caught as AppException).getStatus()).toBe(404);
    });
  });

  describe("processJob", () => {
    it("이미 succeeded인 job은 재처리하지 않고 그대로 반환한다", async () => {
      const job = makeJob({ status: "succeeded", result: [makeCandidate()] });
      const db = createDbMock({ selectResult: [job] });
      const { service, placeService } = createService(db);

      const result = await service.processJob("job-1");

      expect(result.status).toBe("succeeded");
      expect(placeService.extractFromUrl).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it("이미 failed인 job도 재처리하지 않는다", async () => {
      const job = makeJob({
        status: "failed",
        errorCode: "SCRAPER_REQUEST_FAILED",
      });
      const db = createDbMock({ selectResult: [job] });
      const { service, placeService } = createService(db);

      const result = await service.processJob("job-1");

      expect(result.status).toBe("failed");
      expect(placeService.extractFromUrl).not.toHaveBeenCalled();
    });

    it("pending job을 처리해 성공하면 succeeded로 갱신한다", async () => {
      const job = makeJob({ status: "pending" });
      const succeeded = makeJob({
        status: "succeeded",
        result: [makeCandidate()],
      });
      const db = createDbMock({
        selectResult: [job],
        updateResult: [succeeded],
      });
      const { service, placeService } = createService(db);
      (
        placeService.extractFromUrl as ReturnType<typeof jest.fn>
      ).mockResolvedValue([makeCandidate()]);

      const result = await service.processJob("job-1");

      expect(placeService.extractFromUrl).toHaveBeenCalledWith(job.url);
      expect(result.status).toBe("succeeded");
      expect(db.update).toHaveBeenCalledTimes(2); // processing → succeeded
    });

    it("5xx(재시도 대상) 실패는 job을 failed로 남기고 AppException을 던져 재시도를 유도한다", async () => {
      const job = makeJob({ status: "pending" });
      const failed = makeJob({
        status: "failed",
        errorCode: "SCRAPER_REQUEST_FAILED",
      });
      const db = createDbMock({ selectResult: [job], updateResult: [failed] });
      const { service, placeService } = createService(db);
      (
        placeService.extractFromUrl as ReturnType<typeof jest.fn>
      ).mockRejectedValue(
        new AppException("SCRAPER_REQUEST_FAILED", "인스타 응답 실패", 502),
      );

      let caught: unknown;
      try {
        await service.processJob("job-1");
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(AppException);
      expect((caught as AppException).errorCode).toBe("SCRAPER_REQUEST_FAILED");
      expect((caught as AppException).getStatus()).toBe(502);
    });

    it("4xx(영구 실패) 실패는 job을 failed로 남기고 200으로 종료한다(재시도 안 함)", async () => {
      const job = makeJob({ status: "pending" });
      const failed = makeJob({
        status: "failed",
        errorCode: "INVALID_INSTAGRAM_URL",
      });
      const db = createDbMock({ selectResult: [job], updateResult: [failed] });
      const { service, placeService } = createService(db);
      (
        placeService.extractFromUrl as ReturnType<typeof jest.fn>
      ).mockRejectedValue(
        new AppException("INVALID_INSTAGRAM_URL", "잘못된 URL", 400),
      );

      const result = await service.processJob("job-1");

      expect(result.status).toBe("failed");
      expect(result.errorCode).toBe("INVALID_INSTAGRAM_URL");
    });

    it("정의되지 않은 에러(Error)는 500으로 취급해 재시도를 유도한다", async () => {
      const job = makeJob({ status: "pending" });
      const failed = makeJob({
        status: "failed",
        errorCode: "WORKER_UNEXPECTED_ERROR",
      });
      const db = createDbMock({ selectResult: [job], updateResult: [failed] });
      const { service, placeService } = createService(db);
      (
        placeService.extractFromUrl as ReturnType<typeof jest.fn>
      ).mockRejectedValue(new Error("boom"));

      let caught: unknown;
      try {
        await service.processJob("job-1");
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(AppException);
      expect((caught as AppException).errorCode).toBe(
        "WORKER_UNEXPECTED_ERROR",
      );
      expect((caught as AppException).getStatus()).toBe(500);
    });
  });
});
