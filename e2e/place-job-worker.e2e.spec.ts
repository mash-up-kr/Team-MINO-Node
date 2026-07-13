import "reflect-metadata";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import { eq, sql } from "drizzle-orm";
import { AppException } from "../src/common/exceptions/app.exception";
import type { Env } from "../src/config/env.schema";
import { DatabaseService } from "../src/infrastructures/db/database.service";
import { ScraperService } from "../src/infrastructures/scraper/scraper.service";
import type { TasksService } from "../src/infrastructures/tasks/tasks.service";
import { placeJobs } from "../src/modules/place/place.schema";
import type { PlaceService } from "../src/modules/place/place.service";
import type { PlaceCandidate } from "../src/modules/place/place.type";
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
const scraperService = new ScraperService(
  undefined as unknown as ConstructorParameters<typeof ScraperService>[0],
);
const tasksService = {} as unknown as TasksService;

function candidate(): PlaceCandidate {
  return {
    provider: "kakao",
    providerPlaceId: "kakao-onion-seongsu",
    placeName: "어니언 성수",
    address: "서울 성동구 아차산로 8",
    coordinate: { lat: 37.5445, lng: 127.0559 },
  };
}

// extractFromUrl 동작을 테스트마다 바꿔 끼우는 fake placeService.
function makeService(extract: () => Promise<PlaceCandidate[]>) {
  let calls = 0;
  const placeService = {
    extractFromUrl: async () => {
      calls += 1;
      return extract();
    },
  } as unknown as PlaceService;
  const service = new PlaceJobService(
    placeJobRepository,
    tasksService,
    placeService,
    scraperService,
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

    const results = await Promise.all([
      service.processJob(id),
      service.processJob(id),
    ]);

    expect(calls()).toBe(1);
    const statuses = results.map((r) => r.status).sort();
    // 하나는 succeeded, 다른 하나는 claim 실패로 현재 상태(processing)를 반환.
    expect(statuses).toContain("succeeded");
  });

  it("만료되지 않은 processing lease는 다른 배달이 가로챌 수 없다(no-op)", async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000);
    const id = await insertJob({
      shortcode: "Worker02",
      status: "processing",
      leaseExpiresAt: future,
    });
    const { service, calls } = makeService(async () => [candidate()]);

    const result = await service.processJob(id);

    expect(calls()).toBe(0);
    expect(result.status).toBe("processing");
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

  it("누적 시도 상한에 닿으면 5xx 실패도 terminal failed로 종결한다(무한 재시도 차단)", async () => {
    // 상한 직전(9회)까지 시도된 job. 이번 claim으로 10회째가 된다.
    const id = await insertJob({ shortcode: "Worker09", attempts: 9 });
    const { service } = makeService(async () => {
      throw new AppException("SCRAPER_REQUEST_FAILED", "인스타 5xx 응답", 502);
    });

    // throw 없이 반환(2xx) = Cloud Tasks 재시도 중단.
    const result = await service.processJob(id);

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
