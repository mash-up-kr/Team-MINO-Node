import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "bun:test";
import { type INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { CloudTasksGuard } from "../../../src/common/guards/cloud-tasks.guard";
import { AiService } from "../../../src/infrastructures/ai/ai.service";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { GEOCODER_PROVIDERS } from "../../../src/infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../../src/infrastructures/geocoder/geocoder.type";
import { InstagramProvider } from "../../../src/infrastructures/scraper/providers/instagram.provider";
import type { ScrapedPost } from "../../../src/infrastructures/scraper/scraper.type";
import { SentryErrorReporter } from "../../../src/infrastructures/sentry/sentry-reporter";
import { TasksService } from "../../../src/infrastructures/tasks/tasks.service";
import type { PlaceMatch } from "../../../src/modules/place/place.type";
import { placeJobs } from "../../../src/modules/place/place-job.schema";
import { startApp } from "../../start-app";

const POST_URL = "https://www.instagram.com/p/abc123/";
const POST: ScrapedPost = {
  shortcode: "abc123",
  typename: "image",
  caption: "성수동 카페",
  imageUrls: ["https://cdn.example/1.jpg"],
  owner: { id: "1", username: "tester", fullName: "테스터" },
  location: null,
};
const PLACE_QUERY = {
  place_name: "어니언 성수",
  area_name: "성수동",
  area_type: "landmark" as const,
  relation: "카페",
};
const CANDIDATE: GeoCandidate = {
  provider: "kakao",
  providerPlaceId: "kakao-1",
  placeName: "어니언 성수",
  address: "서울 성동구 아차산로 8",
  coordinate: { lat: 37.5445, lng: 127.0559 },
};

const instagram = { fetchPost: jest.fn() };
const ai = { extract: jest.fn() };
const geocoder = { name: "kakao", search: jest.fn() };
const enqueued: string[] = [];
let app: INestApplication;
let baseUrl: string;
let db: DatabaseService;

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(InstagramProvider)
      .useValue(instagram)
      .overrideProvider(AiService)
      .useValue(ai)
      .overrideProvider(GEOCODER_PROVIDERS)
      .useValue([geocoder])
      .overrideProvider(TasksService)
      .useValue({
        getMaxAttempts: async () => 10,
        enqueuePlaceExtraction: async (jobId: string) => {
          enqueued.push(jobId);
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
      .overrideProvider(SentryErrorReporter)
      .useValue({ report: () => undefined }),
  ));
  db = app.get(DatabaseService);
});

beforeEach(async () => {
  instagram.fetchPost.mockReset();
  ai.extract.mockReset();
  geocoder.search.mockReset();
  enqueued.length = 0;
  instagram.fetchPost.mockResolvedValue(POST);
  ai.extract.mockResolvedValue({ places: [PLACE_QUERY] });
  geocoder.search.mockResolvedValue([CANDIDATE]);
  await db.db.execute(sql`truncate table ${placeJobs}`);
});

afterAll(async () => {
  await app.close();
});

function postPlaces(body: unknown) {
  return fetch(`${baseUrl}/api/v1/place/places`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getJob(jobId: string) {
  return fetch(`${baseUrl}/api/v1/place/jobs/${jobId}`);
}

function runWorker(jobId: string) {
  return fetch(`${baseUrl}/internal/place/jobs/${jobId}/process`, {
    method: "POST",
    headers: { "x-test-authorized": "yes" },
  });
}

describe("POST /api/v1/place/places (비동기 job 생성)", () => {
  it("202와 jobId를 즉시 반환하고, 생성 시점에는 외부 경계를 호출하지 않는다", async () => {
    const response = await postPlaces({
      method: "instagram_url",
      data: { url: POST_URL },
    });

    expect(response.status).toBe(202);
    const body = (await response.json()) as { data: { jobId: string } };
    expect(body.data.jobId).toBeTruthy();
    expect(enqueued).toEqual([body.data.jobId]);
    // 추출은 워커 단계에서만 일어난다.
    expect(instagram.fetchPost).not.toHaveBeenCalled();
    expect(ai.extract).not.toHaveBeenCalled();
    expect(geocoder.search).not.toHaveBeenCalled();
  });

  it("워커 실행 후 폴링하면 실제 파이프라인을 거친 PlaceMatch[]를 반환한다", async () => {
    const created = (await (
      await postPlaces({ method: "instagram_url", data: { url: POST_URL } })
    ).json()) as { data: { jobId: string } };
    const jobId = created.data.jobId;

    const workerRes = await runWorker(jobId);
    expect(workerRes.status).toBe(201);

    const res = await getJob(jobId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { status: string; result: PlaceMatch[] };
    };
    expect(body.data.status).toBe("succeeded");
    expect(body.data.result).toEqual([
      {
        extracted: {
          placeName: "어니언 성수",
          areaName: "성수동",
          areaType: "landmark",
          relation: "카페",
        },
        matches: [CANDIDATE],
      },
    ]);
    expect(instagram.fetchPost).toHaveBeenCalledWith(POST_URL);
    expect(geocoder.search).toHaveBeenCalledWith({
      placeName: "어니언 성수",
      areaName: "성수동",
      areaType: "landmark",
    });
  });

  it("모든 지오코딩이 실패하면 워커가 재시도 신호(5xx)를 내고 job은 pending으로 돌아간다", async () => {
    const created = (await (
      await postPlaces({ method: "instagram_url", data: { url: POST_URL } })
    ).json()) as { data: { jobId: string } };
    const jobId = created.data.jobId;

    geocoder.search.mockRejectedValue(new Error("provider down"));
    const workerRes = await runWorker(jobId);
    expect(workerRes.status).toBeGreaterThanOrEqual(500);

    const body = (await getJob(jobId).then((r) => r.json())) as {
      data: { status: string; errorCode: string };
    };
    expect(body.data.status).toBe("pending");
    expect(body.data.errorCode).toBe("GEOCODER_ALL_FAILED");
  });

  it("잘못된 요청은 외부 경계를 호출하지 않고 400을 반환한다", async () => {
    const response = await postPlaces({
      method: "unknown_method",
      data: { url: "not-a-url" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errorCode: "VALIDATION_ERROR",
      message: expect.any(String),
    });
    expect(instagram.fetchPost).not.toHaveBeenCalled();
    expect(ai.extract).not.toHaveBeenCalled();
    expect(geocoder.search).not.toHaveBeenCalled();
    expect(enqueued).toEqual([]);
  });
});
