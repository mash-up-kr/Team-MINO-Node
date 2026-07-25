import "reflect-metadata";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import type { Env } from "../src/config/env.schema";
import { DatabaseService } from "../src/infrastructures/db/database.service";
import type { TasksService } from "../src/infrastructures/tasks/tasks.service";
import { placeJobs } from "../src/modules/place/place.schema";
import type { PlaceService } from "../src/modules/place/place.service";
import { PlaceJobRepository } from "../src/modules/place/place-job.repository";
import { PlaceJobService } from "../src/modules/place/place-job.service";

/**
 * 실제 PostgreSQL에 붙어 dedup(partial unique index)이 동시 요청 레이스를 막고,
 * 같은 게시글 재요청이 early return(기존 job 재사용)하는지 검증한다.
 * pending/processing/succeeded는 재사용, failed만 새 job을 허용한다.
 *
 *   docker compose up -d postgres && bun run db:schema-init && bun run db:migrate
 *   bun run test:e2e
 */

// test:e2e가 DATABASE_URL을 주입한다. DatabaseService가 읽는 env를 그대로 흉내낸다.
const configStub = {
  getOrThrow: (key: string) => process.env[key] as string,
  get: (key: string, fallback?: unknown) => process.env[key] ?? fallback,
} as unknown as ConfigService<Env>;

const databaseService = new DatabaseService(configStub);
const placeJobRepository = new PlaceJobRepository(databaseService);
// enqueue 호출을 세는 fake. 필요 시 실패하도록 바꿀 수 있다.
let enqueued: string[];
function makeService(enqueueImpl?: (jobId: string) => Promise<void>) {
  enqueued = [];
  const tasksService = {
    getMaxAttempts: async () => 10,
    enqueuePlaceExtraction: async (jobId: string) => {
      enqueued.push(jobId);
      if (enqueueImpl) await enqueueImpl(jobId);
    },
  } as unknown as TasksService;
  const placeService = {} as unknown as PlaceService;
  return new PlaceJobService(placeJobRepository, tasksService, placeService);
}

const urlFor = (shortcode: string) =>
  `https://www.instagram.com/p/${shortcode}/`;

async function countRows(shortcode: string): Promise<number> {
  const rows = await databaseService.db
    .select({ id: placeJobs.id })
    .from(placeJobs)
    .where(sql`${placeJobs.shortcode} = ${shortcode}`);
  return rows.length;
}

beforeEach(async () => {
  await databaseService.db.execute(sql`truncate table ${placeJobs}`);
});

afterAll(async () => {
  await databaseService.onModuleDestroy();
});

describe("place_jobs dedup (real PostgreSQL)", () => {
  it("동일 shortcode 20건 동시 생성 시 행 1개·enqueue 1회·jobId 공유", async () => {
    const service = makeService();
    const url = urlFor("Concurrent1");

    const results = await Promise.all(
      Array.from({ length: 20 }, () => service.createJob(url)),
    );

    const jobIds = new Set(results.map((r) => r.jobId));
    expect(jobIds.size).toBe(1);
    expect(enqueued.length).toBe(1);
    expect(await countRows("Concurrent1")).toBe(1);
  });

  it("서로 다른 shortcode는 각각 별개의 job을 만든다", async () => {
    const service = makeService();

    const [a, b] = await Promise.all([
      service.createJob(urlFor("Distinct01")),
      service.createJob(urlFor("Distinct02")),
    ]);

    expect(a.jobId).not.toBe(b.jobId);
    expect(enqueued.length).toBe(2);
  });

  it("이전 job이 succeeded면 재요청은 기존 job을 재사용한다(early return, enqueue 없음)", async () => {
    const service = makeService();
    const url = urlFor("Succeeded1");

    const first = await service.createJob(url);
    // 첫 job을 succeeded로 전이 → 결과 캐시로 재사용 대상.
    await databaseService.db
      .update(placeJobs)
      .set({ status: "succeeded" })
      .where(sql`${placeJobs.id} = ${first.jobId}`);

    const second = await service.createJob(url);

    expect(second.jobId).toBe(first.jobId);
    expect(await countRows("Succeeded1")).toBe(1);
    // enqueue는 최초 생성 1회뿐.
    expect(enqueued).toEqual([first.jobId]);
  });

  it("태스크 없이 오래 방치된 pending job은 재요청 시 재enqueue된다(유실 복구)", async () => {
    const service = makeService();
    const url = urlFor("Stale00001");

    const first = await service.createJob(url);
    // INSERT 직후·enqueue 직전 크래시를 흉내: updatedAt을 lease 기준(10분)보다 과거로.
    await databaseService.db.execute(
      sql`update ${placeJobs} set updated_at = now() - interval '11 minutes' where id = ${first.jobId}`,
    );

    const second = await service.createJob(url);

    expect(second.jobId).toBe(first.jobId);
    // 최초 생성 1회 + 유실 복구 1회.
    expect(enqueued).toEqual([first.jobId, first.jobId]);
    expect(await countRows("Stale00001")).toBe(1);
  });

  it("오래 방치된 pending job에 동시 재요청이 와도 재enqueue는 1회뿐이다", async () => {
    const service = makeService();
    const url = urlFor("StaleRace01");
    const first = await service.createJob(url);
    await databaseService.db.execute(
      sql`update ${placeJobs} set updated_at = now() - interval '11 minutes' where id = ${first.jobId}`,
    );
    enqueued = [];

    const results = await Promise.all(
      Array.from({ length: 20 }, () => service.createJob(url)),
    );

    expect(new Set(results.map((result) => result.jobId))).toEqual(
      new Set([first.jobId]),
    );
    expect(enqueued).toEqual([first.jobId]);
  });

  it("lease가 만료된 processing job은 pending으로 복구해 재enqueue한다", async () => {
    const service = makeService();
    const url = urlFor("ExpiredLease01");
    const first = await service.createJob(url);
    await databaseService.db.execute(
      sql`update ${placeJobs}
          set status = 'processing',
              processing_lease_expires_at = now() - interval '1 minute'
          where id = ${first.jobId}`,
    );
    enqueued = [];

    const reused = await service.createJob(url);

    expect(reused.jobId).toBe(first.jobId);
    expect(enqueued).toEqual([first.jobId]);
  });

  it("이전 job이 failed면 재요청은 새 job을 만든다", async () => {
    const service = makeService();
    const url = urlFor("Failed0001");

    const first = await service.createJob(url);
    // 첫 job을 failed로 전이 → dedup 슬롯 해제.
    await databaseService.db
      .update(placeJobs)
      .set({ status: "failed" })
      .where(sql`${placeJobs.id} = ${first.jobId}`);

    const second = await service.createJob(url);

    expect(second.jobId).not.toBe(first.jobId);
    expect(await countRows("Failed0001")).toBe(2);
  });

  it("enqueue 실패로 terminal failed가 되면 재요청이 새 job을 만든다", async () => {
    const service = makeService(async () => {
      throw new Error("Cloud Tasks unavailable");
    });
    const url = urlFor("Enqueue01");

    await expect(service.createJob(url)).rejects.toMatchObject({
      errorCode: "ENQUEUE_FAILED",
    });

    // 실패한 job은 failed(terminal)라 dedup 슬롯을 막지 않는다 → 정상 enqueue로 재생성 가능.
    const ok = makeService();
    const created = await ok.createJob(url);
    expect(created.jobId).toBeTruthy();
    expect(enqueued).toEqual([created.jobId]);
  });

  it("raw SQL로 같은 shortcode 재사용 상태 행 2개를 넣으면 23505로 거부된다", async () => {
    await databaseService.db.execute(
      sql`insert into ${placeJobs} (url, shortcode, status) values (${urlFor("Raw01")}, 'Raw01', 'succeeded')`,
    );

    let code: unknown;
    try {
      await databaseService.db.execute(
        sql`insert into ${placeJobs} (url, shortcode, status) values (${urlFor("Raw01")}, 'Raw01', 'pending')`,
      );
    } catch (error) {
      // drizzle이 DrizzleQueryError로 감싸므로 실제 SQLSTATE는 .cause에 있다.
      const err = error as { code?: string; cause?: { code?: string } };
      code = err.code ?? err.cause?.code;
    }
    expect(code).toBe("23505");

    // 첫 행을 failed로 바꾸면 동일 shortcode 행을 다시 넣을 수 있다.
    await databaseService.db.execute(
      sql`update ${placeJobs} set status = 'failed' where shortcode = 'Raw01'`,
    );
    await databaseService.db.execute(
      sql`insert into ${placeJobs} (url, shortcode, status) values (${urlFor("Raw01")}, 'Raw01', 'pending')`,
    );
    expect(await countRows("Raw01")).toBe(2);
  });
});
