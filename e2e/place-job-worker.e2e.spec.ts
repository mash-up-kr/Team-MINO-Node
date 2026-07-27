import "reflect-metadata";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import { eq, sql } from "drizzle-orm";
import { AppException } from "../src/common/exceptions/app.exception";
import type { Env } from "../src/config/env.schema";
import { DatabaseService } from "../src/infrastructures/db/database.service";
import type { TasksService } from "../src/infrastructures/tasks/tasks.service";
import { placeJobs } from "../src/modules/place/place.schema";
import type { PlaceService } from "../src/modules/place/place.service";
import type { PlaceMatch } from "../src/modules/place/place.type";
import { PlaceJobRepository } from "../src/modules/place/place-job.repository";
import { PlaceJobService } from "../src/modules/place/place-job.service";

/**
 * 실제 PostgreSQL에서 워커 상태머신(조건부 claim / lease / 재시도)을 검증한다.
 *
 *   docker compose up -d postgres && bun run db:schema-init && bun run db:migrate
 *   bun run test:e2e
 */

const configStub = {
  getOrThrow: (key: string) => process.env[key] as string,
  get: (key: string, fallback?: unknown) => process.env[key] ?? fallback,
} as unknown as ConfigService<Env>;

const databaseService = new DatabaseService(configStub);
const placeJobRepository = new PlaceJobRepository(databaseService);
function candidate(): PlaceMatch {
  return {
    extracted: {
      placeName: "어니언 성수",
      areaName: "성수동",
      areaType: "region",
      relation: "게시글에 소개된 장소",
    },
    matches: [
      {
        provider: "kakao",
        providerPlaceId: "kakao-onion-seongsu",
        placeName: "어니언 성수",
        address: "서울 성동구 아차산로 8",
        coordinate: { lat: 37.5445, lng: 127.0559 },
      },
    ],
  };
}

// extractFromUrl과 큐 설정 조회 동작을 테스트마다 바꿔 끼우는 fake.
function makeService(
  extract: () => Promise<PlaceMatch[]>,
  getMaxAttempts: () => Promise<number> = async () => 10,
) {
  let calls = 0;
  const placeService = {
    extractFromUrl: async () => {
      calls += 1;
      return extract();
    },
  } as unknown as PlaceService;
  const tasksService = { getMaxAttempts } as unknown as TasksService;
  const service = new PlaceJobService(
    placeJobRepository,
    tasksService,
    placeService,
  );
  return { service, calls: () => calls };
}

async function insertJob(overrides: {
  shortcode: string;
  status?: "pending" | "processing" | "succeeded" | "failed";
  leaseExpiresAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  attempts?: number;
}): Promise<string> {
  const [row] = await databaseService.db
    .insert(placeJobs)
    .values({
      url: `https://www.instagram.com/p/${overrides.shortcode}/`,
      shortcode: overrides.shortcode,
      status: overrides.status ?? "pending",
      processingLeaseExpiresAt: overrides.leaseExpiresAt ?? null,
      errorCode: overrides.errorCode ?? null,
      errorMessage: overrides.errorMessage ?? null,
      attempts: overrides.attempts ?? 0,
    })
    .returning({ id: placeJobs.id });
  return row.id;
}

async function readJob(id: string) {
  const [row] = await databaseService.db
    .select()
    .from(placeJobs)
    .where(eq(placeJobs.id, id));
  return row;
}

beforeEach(async () => {
  await databaseService.db.execute(sql`truncate table ${placeJobs}`);
});

afterAll(async () => {
  await databaseService.onModuleDestroy();
});

describe("PlaceJobService.processJob 상태머신 (real PostgreSQL)", () => {
  it("동시 배달 2건이 와도 추출은 정확히 1번만 실행된다", async () => {
    const id = await insertJob({ shortcode: "Worker01" });
    const { service, calls } = makeService(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return [candidate()];
    });

    const results = await Promise.allSettled([
      service.processJob(id),
      service.processJob(id),
    ]);

    expect(calls()).toBe(1);
    expect(
      results.some(
        (result) =>
          result.status === "fulfilled" && result.value.status === "succeeded",
      ),
    ).toBe(true);
  });

  it("만료되지 않은 processing lease는 가로채지 않고 재시도 신호를 보낸다", async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000);
    const id = await insertJob({
      shortcode: "Worker02",
      status: "processing",
      leaseExpiresAt: future,
    });
    const { service, calls } = makeService(async () => [candidate()]);

    expect(calls()).toBe(0);
    await expect(service.processJob(id)).rejects.toMatchObject({
      errorCode: "PLACE_JOB_BUSY",
    });
  });

  it("만료된 processing lease는 다시 claim되어 처리된다", async () => {
    const past = new Date(Date.now() - 60 * 1000);
    const id = await insertJob({
      shortcode: "Worker03",
      status: "processing",
      leaseExpiresAt: past,
    });
    const { service, calls } = makeService(async () => [candidate()]);

    const result = await service.processJob(id);

    expect(calls()).toBe(1);
    expect(result.status).toBe("succeeded");
    expect((await readJob(id)).processingLeaseExpiresAt).toBeNull();
  });

  it("만료된 lease를 새 워커가 claim한 뒤에는 이전 워커가 결과를 덮어쓸 수 없다", async () => {
    const id = await insertJob({ shortcode: "WorkerLeaseRace" });
    const firstLease = new Date("2026-01-01T00:10:00Z");
    const firstClaim = await placeJobRepository.claimForProcessing(
      id,
      new Date("2026-01-01T00:00:00Z"),
      firstLease,
    );
    if (!firstClaim) throw new Error("first claim must succeed");

    const secondLease = new Date("2026-01-01T00:20:01Z");
    const secondClaim = await placeJobRepository.claimForProcessing(
      id,
      new Date("2026-01-01T00:10:01Z"),
      secondLease,
    );
    if (!secondClaim) throw new Error("second claim must succeed");

    const lateFirstResult = await placeJobRepository.markSucceeded(
      id,
      firstClaim.processingLeaseExpiresAt,
      [candidate()],
    );

    expect(lateFirstResult).toBeUndefined();
    expect((await readJob(id)).status).toBe("processing");
    expect((await readJob(id)).processingLeaseExpiresAt).toEqual(secondLease);

    const secondResult = await placeJobRepository.markSucceeded(
      id,
      secondClaim.processingLeaseExpiresAt,
      [
        {
          ...candidate(),
          extracted: {
            ...candidate().extracted,
            placeName: "두 번째 워커 결과",
          },
        },
      ],
    );

    expect(secondResult?.status).toBe("succeeded");
    expect((await readJob(id)).result?.[0]?.extracted.placeName).toBe(
      "두 번째 워커 결과",
    );
  });

  it("succeeded/failed terminal job은 재배달 시 no-op으로 그대로 반환한다", async () => {
    const succeededId = await insertJob({
      shortcode: "Worker04a",
      status: "succeeded",
    });
    const failedId = await insertJob({
      shortcode: "Worker04b",
      status: "failed",
      errorCode: "INVALID_INSTAGRAM_URL",
    });
    const { service, calls } = makeService(async () => [candidate()]);

    expect((await service.processJob(succeededId)).status).toBe("succeeded");
    expect((await service.processJob(failedId)).status).toBe("failed");
    expect(calls()).toBe(0);
  });

  it("5xx는 pending으로 되돌리고 throw하며, 다음 배달이 재시도해 성공한다", async () => {
    const id = await insertJob({ shortcode: "Worker05" });
    const failing = makeService(async () => {
      throw new AppException("SCRAPER_REQUEST_FAILED", "인스타 5xx 응답", 502);
    });

    await expect(failing.service.processJob(id)).rejects.toMatchObject({
      errorCode: "SCRAPER_REQUEST_FAILED",
    });
    const afterFail = await readJob(id);
    expect(afterFail.status).toBe("pending");
    expect(afterFail.processingLeaseExpiresAt).toBeNull();
    expect(afterFail.errorCode).toBe("SCRAPER_REQUEST_FAILED");

    // 재배달: 이번엔 성공 → succeeded, 이전 진단 초기화.
    const ok = makeService(async () => [candidate()]);
    const retried = await ok.service.processJob(id);
    expect(retried.status).toBe("succeeded");
    const done = await readJob(id);
    expect(done.errorCode).toBeNull();
    expect(done.errorMessage).toBeNull();
    expect(done.processingLeaseExpiresAt).toBeNull();
  });

  it("예상 밖 에러(비 AppException)는 500으로 취급해 pending 복귀 후 throw한다", async () => {
    const id = await insertJob({ shortcode: "Worker06" });
    const { service } = makeService(async () => {
      throw new Error("boom");
    });

    await expect(service.processJob(id)).rejects.toMatchObject({
      errorCode: "WORKER_UNEXPECTED_ERROR",
    });
    expect((await readJob(id)).status).toBe("pending");
  });

  it("큐 재시도 설정을 읽지 못하면 failed로 종결해 새 task 재생성을 막는다", async () => {
    const id = await insertJob({ shortcode: "WorkerQueueConfig" });
    const { service } = makeService(
      async () => {
        throw new AppException(
          "SCRAPER_REQUEST_FAILED",
          "인스타 5xx 응답",
          502,
        );
      },
      async () => {
        throw new Error("queue unavailable");
      },
    );

    const result = await service.processJob(id);

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("CLOUD_TASKS_CONFIG_UNAVAILABLE");
    const row = await readJob(id);
    expect(row.status).toBe("failed");
    expect(row.errorCode).toBe("CLOUD_TASKS_CONFIG_UNAVAILABLE");
    expect(row.errorMessage).toBe("queue unavailable");
    expect(row.processingLeaseExpiresAt).toBeNull();
  });

  it("4xx는 terminal failed로 남기고 throw 없이 반환한다(재시도 안 함)", async () => {
    const id = await insertJob({ shortcode: "Worker07" });
    const { service } = makeService(async () => {
      throw new AppException("INVALID_INSTAGRAM_URL", "잘못된 URL", 400);
    });

    const result = await service.processJob(id);

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("INVALID_INSTAGRAM_URL");
    expect((await readJob(id)).processingLeaseExpiresAt).toBeNull();
  });

  it("Cloud Tasks 마지막 시도면 5xx 실패도 terminal failed로 종결한다", async () => {
    const id = await insertJob({ shortcode: "Worker09" });
    const { service } = makeService(async () => {
      throw new AppException("SCRAPER_REQUEST_FAILED", "인스타 5xx 응답", 502);
    });

    // throw 없이 반환(2xx) = Cloud Tasks 재시도 중단.
    const result = await service.processJob(id, 9);

    expect(result.status).toBe("failed");
    const row = await readJob(id);
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(1);
    expect(row.processingLeaseExpiresAt).toBeNull();
  });

  it("새 task의 첫 실행이어도 job 누적 시도가 상한이면 5xx 실패를 종결한다", async () => {
    const id = await insertJob({ shortcode: "Worker11", attempts: 9 });
    const { service } = makeService(async () => {
      throw new AppException("SCRAPER_REQUEST_FAILED", "인스타 5xx 응답", 502);
    });

    const result = await service.processJob(id, 0);

    expect(result.status).toBe("failed");
    const row = await readJob(id);
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(10);
    expect(row.processingLeaseExpiresAt).toBeNull();
  });

  it("claim할 때마다 attempts가 1씩 누적된다", async () => {
    const id = await insertJob({ shortcode: "Worker10" });
    const { service } = makeService(async () => [candidate()]);

    await service.processJob(id);

    expect((await readJob(id)).attempts).toBe(1);
  });

  it("존재하지 않는 job은 404를 던진다", async () => {
    const { service } = makeService(async () => [candidate()]);

    await expect(service.processJob(randomUUID())).rejects.toMatchObject({
      errorCode: "PLACE_JOB_NOT_FOUND",
    });
  });

  it("성공 시 lease와 이전 진단(errorCode/Message)을 모두 비운다", async () => {
    const id = await insertJob({
      shortcode: "Worker08",
      status: "pending",
      errorCode: "SCRAPER_REQUEST_FAILED",
      errorMessage: "이전 재시도의 흔적",
    });
    const { service } = makeService(async () => [candidate()]);

    await service.processJob(id);

    const done = await readJob(id);
    expect(done.status).toBe("succeeded");
    expect(done.errorCode).toBeNull();
    expect(done.errorMessage).toBeNull();
    expect(done.processingLeaseExpiresAt).toBeNull();
    expect(done.result).toEqual([candidate()]);
  });
});
