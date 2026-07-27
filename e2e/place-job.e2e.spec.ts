import "reflect-metadata";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { type INestApplication, UnauthorizedException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { CloudTasksGuard } from "../src/common/guards/cloud-tasks.guard";
import { ResponseInterceptor } from "../src/common/interceptors/response.interceptor";
import { DatabaseService } from "../src/infrastructures/db/database.service";
import { TasksService } from "../src/infrastructures/tasks/tasks.service";
import { PlaceModule } from "../src/modules/place/place.module";
import { placeJobs } from "../src/modules/place/place.schema";
import { PlaceService } from "../src/modules/place/place.service";
import type { PlaceMatch } from "../src/modules/place/place.type";

/**
 * 비동기 장소 추출 job API의 HTTP 계약을 실제 Nest/Hono + PostgreSQL로 고정한다.
 * Cloud Tasks/추출(AI) 네트워크 경계만 fake로 대체한다.
 *
 *   docker compose up -d postgres && bun run db:schema-init && bun run db:migrate
 *   bun run test:e2e
 */

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

// 테스트마다 갈아끼우는 추출/enqueue 동작.
const extraction: { fn: (url: string) => Promise<PlaceMatch[]> } = {
  fn: async () => [candidate()],
};
const enqueue: { fail: boolean; calls: string[] } = { fail: false, calls: [] };

let app: INestApplication;
let baseUrl: string;
let db: DatabaseService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PlaceModule,
    ],
  })
    // 추출(AI)·큐 네트워크만 fake. DB/스크래퍼 파싱/컨트롤러/가드 배선은 실제.
    .overrideProvider(PlaceService)
    .useValue({ extractFromUrl: (url: string) => extraction.fn(url) })
    .overrideProvider(TasksService)
    .useValue({
      getMaxAttempts: async () => 10,
      enqueuePlaceExtraction: async (jobId: string) => {
        enqueue.calls.push(jobId);
        if (enqueue.fail) throw new Error("Cloud Tasks unavailable");
      },
    })
    /*
     * 실제 OIDC 토큰을 만들 수 없으므로, 워커 가드는 테스트 헤더로 인가를 흉내낸다.
     * 실제 OIDC 검증은 cloud-tasks.guard.spec에서 단위 검증한다.
     */
    .overrideGuard(CloudTasksGuard)
    .useValue({
      canActivate: (ctx: {
        switchToHttp: () => {
          getRequest: () => { headers: Record<string, string | undefined> };
        };
      }) => {
        const req = ctx.switchToHttp().getRequest();
        if (req.headers["x-test-authorized"] === "yes") return true;
        throw new UnauthorizedException("missing OIDC token");
      },
    })
    .compile();

  const adapter = new BunHonoAdapter();
  app = moduleRef.createNestApplication(adapter, {
    bufferLogs: true,
    logger: false,
  });
  app.useGlobalFilters(new HttpExceptionFilter({ report: () => undefined }));
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(0);
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  db = app.get(DatabaseService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  extraction.fn = async () => [candidate()];
  enqueue.fail = false;
  enqueue.calls = [];
  await db.db.execute(sql`truncate table ${placeJobs}`);
});

function createBody(url: string) {
  return {
    method: "instagram_url",
    data: { url },
  };
}

async function postJob(url: string) {
  const res = await fetch(`${baseUrl}/api/v1/place/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(createBody(url)),
  });
  return res;
}

async function getJob(jobId: string) {
  const res = await fetch(`${baseUrl}/api/v1/place/jobs/${jobId}`);
  return res;
}

async function runWorker(jobId: string, authorized = true) {
  return fetch(`${baseUrl}/internal/place/jobs/${jobId}/process`, {
    method: "POST",
    headers: authorized ? { "x-test-authorized": "yes" } : {},
  });
}

const POST_URL = "https://www.instagram.com/p/E2eCreate1/";

describe("비동기 장소 추출 job API (e2e)", () => {
  it("POST /jobs는 202와 jobId를 반환하고 enqueue한다", async () => {
    const res = await postJob(POST_URL);

    expect(res.status).toBe(202);
    const body = (await res.json()) as { data: { jobId: string } };
    expect(body.data.jobId).toBeTruthy();
    expect(enqueue.calls).toEqual([body.data.jobId]);
  });

  it("진행 중 동일 게시글 재요청은 같은 jobId를 돌려주고 중복 enqueue하지 않는다", async () => {
    const first = (await (await postJob(POST_URL)).json()) as {
      data: { jobId: string };
    };
    const second = (await (await postJob(POST_URL)).json()) as {
      data: { jobId: string };
    };

    expect(second.data.jobId).toBe(first.data.jobId);
    expect(enqueue.calls).toEqual([first.data.jobId]);
  });

  it("succeeded 후 동일 게시글 재요청도 같은 jobId를 돌려준다(결과 캐시 재사용)", async () => {
    const created = (await (await postJob(POST_URL)).json()) as {
      data: { jobId: string };
    };
    const jobId = created.data.jobId;
    await runWorker(jobId);

    const again = (await (await postJob(POST_URL)).json()) as {
      data: { jobId: string };
    };

    expect(again.data.jobId).toBe(jobId);
    // 새 enqueue 없음: 최초 생성 1회가 전부.
    expect(enqueue.calls).toEqual([jobId]);
    const body = (await getJob(jobId).then((r) => r.json())) as {
      data: { status: string; result: PlaceMatch[] };
    };
    expect(body.data.status).toBe("succeeded");
    expect(body.data.result).toEqual([candidate()]);
  });

  it("잘못된 인스타 URL은 400을 반환하고 job/enqueue를 만들지 않는다", async () => {
    const res = await postJob("https://evil.com/?x=instagram.com/p/x");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("INVALID_INSTAGRAM_URL");
    expect(enqueue.calls).toEqual([]);
    const rows = await db.db.select().from(placeJobs);
    expect(rows.length).toBe(0);
  });

  it("enqueue 실패 시 502 ENQUEUE_FAILED로 응답한다", async () => {
    enqueue.fail = true;

    const res = await postJob(POST_URL);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("ENQUEUE_FAILED");
  });

  it("GET /jobs/:id는 생성 직후 pending 형태를 반환한다", async () => {
    const created = (await (await postJob(POST_URL)).json()) as {
      data: { jobId: string };
    };

    const res = await getJob(created.data.jobId);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        jobId: string;
        status: string;
        result: unknown;
        errorCode: unknown;
      };
    };
    expect(body.data.status).toBe("pending");
    expect(body.data.result).toBeNull();
  });

  it("create → 워커 → 폴링으로 succeeded와 결과 직렬화까지 확인한다", async () => {
    const created = (await (await postJob(POST_URL)).json()) as {
      data: { jobId: string };
    };
    const jobId = created.data.jobId;

    const workerRes = await runWorker(jobId);
    expect(workerRes.status).toBe(201);

    const res = await getJob(jobId);
    const body = (await res.json()) as {
      data: { status: string; result: PlaceMatch[] };
    };
    expect(body.data.status).toBe("succeeded");
    expect(body.data.result).toEqual([candidate()]);
  });

  it("인가되지 않은 워커 호출은 401을 반환하고 추출을 실행하지 않는다", async () => {
    const created = (await (await postJob(POST_URL)).json()) as {
      data: { jobId: string };
    };

    const res = await runWorker(created.data.jobId, false);

    expect(res.status).toBe(401);
    const after = await getJob(created.data.jobId);
    const body = (await after.json()) as { data: { status: string } };
    expect(body.data.status).toBe("pending");
  });

  it("존재하지 않는 job 워커 호출은 404를 반환한다", async () => {
    const res = await runWorker(crypto.randomUUID());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("PLACE_JOB_NOT_FOUND");
  });

  it("UUID 형식이 아닌 jobId는 조회/워커 모두 400을 반환한다", async () => {
    const getRes = await getJob("not-a-uuid");
    expect(getRes.status).toBe(400);
    const getBody = (await getRes.json()) as { errorCode: string };
    expect(getBody.errorCode).toBe("VALIDATION_ERROR");

    const workerRes = await runWorker("not-a-uuid");
    expect(workerRes.status).toBe(400);
  });

  it("재시도 대상(5xx) 실패는 non-2xx로 응답하고 job을 pending으로 되돌린 뒤 재시도에 성공한다", async () => {
    const created = (await (await postJob(POST_URL)).json()) as {
      data: { jobId: string };
    };
    const jobId = created.data.jobId;

    const { AppException } = await import(
      "../src/common/exceptions/app.exception"
    );
    extraction.fn = async () => {
      throw new AppException("SCRAPER_REQUEST_FAILED", "인스타 5xx", 502);
    };
    const failRes = await runWorker(jobId);
    expect(failRes.status).toBeGreaterThanOrEqual(500);
    expect(
      (
        (await getJob(jobId).then((r) => r.json())) as {
          data: { status: string };
        }
      ).data.status,
    ).toBe("pending");

    // 재배달: 이번엔 성공.
    extraction.fn = async () => [candidate()];
    const okRes = await runWorker(jobId);
    expect(okRes.status).toBe(201);
    expect(
      (
        (await getJob(jobId).then((r) => r.json())) as {
          data: { status: string };
        }
      ).data.status,
    ).toBe("succeeded");
  });

  it("영구 실패(4xx)는 2xx로 응답하고 job을 failed로 남긴다", async () => {
    const created = (await (await postJob(POST_URL)).json()) as {
      data: { jobId: string };
    };
    const jobId = created.data.jobId;

    const { AppException } = await import(
      "../src/common/exceptions/app.exception"
    );
    extraction.fn = async () => {
      throw new AppException("INVALID_INSTAGRAM_URL", "잘못된 URL", 400);
    };

    const res = await runWorker(jobId);
    expect(res.status).toBe(201);

    const body = (await getJob(jobId).then((r) => r.json())) as {
      data: { status: string; errorCode: string };
    };
    expect(body.data.status).toBe("failed");
    expect(body.data.errorCode).toBe("INVALID_INSTAGRAM_URL");
  });
});
