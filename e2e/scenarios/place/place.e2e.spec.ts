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
import { isNull, sql } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { AppException } from "../../../src/common/exceptions/app.exception";
import { CloudTasksGuard } from "../../../src/common/guards/cloud-tasks.guard";
import { AiService } from "../../../src/infrastructures/ai/ai.service";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { GEOCODER_PROVIDERS } from "../../../src/infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../../src/infrastructures/geocoder/geocoder.type";
import { InstagramProvider } from "../../../src/infrastructures/scraper/providers/instagram.provider";
import type { ScrapedPost } from "../../../src/infrastructures/scraper/scraper.type";
import { SentryErrorReporter } from "../../../src/infrastructures/sentry/sentry-reporter";
import { TasksService } from "../../../src/infrastructures/tasks/tasks.service";
import { places } from "../../../src/modules/place/place.schema";
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
const enqueuePlaceExtraction = jest.fn(async (url: string) => {
  enqueued.push(url);
});
let app: INestApplication;
let baseUrl: string;
let db: DatabaseService;

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TasksService)
      .useValue({
        enqueuePlaceExtraction,
      })
      .overrideProvider(InstagramProvider)
      .useValue(instagram)
      .overrideProvider(AiService)
      .useValue(ai)
      .overrideProvider(GEOCODER_PROVIDERS)
      .useValue([geocoder])
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
  enqueuePlaceExtraction.mockClear();
  enqueued.length = 0;
  instagram.fetchPost.mockResolvedValue(POST);
  ai.extract.mockResolvedValue({
    places: [
      {
        place_name: "어니언 성수",
        area_name: "성수동",
        area_type: "landmark",
        relation: "카페",
      },
    ],
  });
  geocoder.search.mockResolvedValue([CANDIDATE]);
  await db.db.execute(sql`truncate table ${places} cascade`);
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

function runInternalExtraction() {
  return fetch(`${baseUrl}/internal/tasks/pin-extraction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-authorized": "yes",
    },
    body: JSON.stringify({ url: POST_URL }),
  });
}

describe("장소 추출 enqueue + 최종 DB 저장", () => {
  it("POST는 ok 응답과 함께 202를 반환하고 추출은 실행하지 않는다", async () => {
    const response = await postPlaces({
      url: POST_URL,
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { ok: true } });
    expect(enqueued).toEqual([POST_URL]);
    expect(instagram.fetchPost).not.toHaveBeenCalled();
    expect(ai.extract).not.toHaveBeenCalled();
    expect(geocoder.search).not.toHaveBeenCalled();
  });

  it("internal endpoint는 장소를 추출하고 최종 후보를 places에 저장한다", async () => {
    const response = await runInternalExtraction();

    expect(response.status).toBe(201);
    expect(await response.text()).toBe("");
    expect(instagram.fetchPost).toHaveBeenCalledWith(POST_URL);
    expect(geocoder.search).toHaveBeenCalledWith({
      placeName: "어니언 성수",
      areaName: "성수동",
      areaType: "landmark",
    });

    const rows = await db.db.select().from(places);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "kakao",
      providerPlaceId: "kakao-1",
      name: "어니언 성수",
      address: "서울 성동구 아차산로 8",
    });
  });

  it("같은 payload가 중복 배달돼도 장소는 한 번만 저장한다", async () => {
    const first = await runInternalExtraction();
    const second = await runInternalExtraction();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(instagram.fetchPost).toHaveBeenCalledTimes(2);

    const rows = await db.db.select().from(places);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "kakao",
      providerPlaceId: "kakao-1",
    });
  });

  it("soft-delete된 장소는 되살리지 않고 새 active 행으로 다시 저장한다", async () => {
    await runInternalExtraction();
    await db.db
      .update(places)
      .set({ deletedAt: new Date() })
      .where(isNull(places.deletedAt));

    const response = await runInternalExtraction();

    expect(response.status).toBe(201);
    const rows = await db.db.select().from(places);
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.deletedAt === null)).toHaveLength(1);
  });

  it("인가되지 않은 internal 호출은 추출하지 않는다", async () => {
    const response = await fetch(`${baseUrl}/internal/tasks/pin-extraction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: POST_URL }),
    });

    expect(response.status).toBe(401);
    expect(instagram.fetchPost).not.toHaveBeenCalled();
  });

  it("영구적인 4xx 추출 실패는 2xx로 acknowledge한다", async () => {
    instagram.fetchPost.mockRejectedValueOnce(
      new AppException("POST_NOT_FOUND", "게시글을 찾을 수 없습니다.", 404),
    );

    const response = await runInternalExtraction();

    expect(response.status).toBe(201);
    expect(await response.text()).toBe("");
    expect(await db.db.select().from(places)).toHaveLength(0);
  });

  it("재시도 가능한 추출 실패는 non-2xx로 반환한다", async () => {
    geocoder.search.mockRejectedValue(new Error("provider down"));

    const response = await runInternalExtraction();

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      errorCode: "GEOCODER_ALL_FAILED",
    });
  });

  it("잘못된 요청은 enqueue하지 않는다", async () => {
    const response = await postPlaces({
      url: "not-a-url",
    });

    expect(response.status).toBe(400);
    expect(enqueued).toEqual([]);
  });

  it("enqueue 실패는 502로 반환하고 Internal extraction을 실행하지 않는다", async () => {
    enqueuePlaceExtraction.mockRejectedValueOnce(
      new Error("queue unavailable"),
    );

    const response = await postPlaces({
      url: POST_URL,
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      errorCode: "ENQUEUE_FAILED",
      message: "작업을 큐에 등록하지 못했습니다.",
    });
    expect(instagram.fetchPost).not.toHaveBeenCalled();
  });
});
