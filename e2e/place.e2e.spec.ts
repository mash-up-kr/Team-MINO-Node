import "reflect-metadata";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { ResponseInterceptor } from "../src/common/interceptors/response.interceptor";
import { AiService } from "../src/infrastructures/ai/ai.service";
import { GeocoderService } from "../src/infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../src/infrastructures/geocoder/geocoder.type";
import { ScraperService } from "../src/infrastructures/scraper/scraper.service";
import type { ScrapedPost } from "../src/infrastructures/scraper/scraper.type";
import { PlaceModule } from "../src/modules/place/place.module";

// 외부 어댑터(스크래퍼/AI/지오코더)만 가짜로 대체한다. 그 외 조립(DI·컨트롤러·파이프·
// 인터셉터·필터·PlaceService 조합)은 전부 실제로 관통시켜 e2e 계약을 검증한다.
const FAKE_POST: ScrapedPost = {
  shortcode: "abc123",
  typename: "image",
  caption: "성수동 카페",
  imageUrls: ["https://cdn.example/1.jpg"],
  owner: { id: "1", username: "tester", fullName: "테스터" },
  location: null,
};

function candidate(overrides: Partial<GeoCandidate> = {}): GeoCandidate {
  return {
    provider: "kakao",
    providerPlaceId: "kakao-1",
    placeName: "어니언 성수",
    address: "서울 성동구 아차산로 8",
    coordinate: { lat: 37.5445, lng: 127.0559 },
    ...overrides,
  };
}

const scraper = { fetchPost: jest.fn() };
const ai = { extract: jest.fn() };
const geocoder = { searchAll: jest.fn() };

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PlaceModule,
    ],
  })
    .overrideProvider(ScraperService)
    .useValue(scraper)
    .overrideProvider(AiService)
    .useValue(ai)
    .overrideProvider(GeocoderService)
    .useValue(geocoder)
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
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  scraper.fetchPost.mockReset();
  ai.extract.mockReset();
  geocoder.searchAll.mockReset();
});

function postPlaces(url: string) {
  return fetch(`${baseUrl}/api/v1/place/places`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method: "instagram_url", data: { url } }),
  });
}

const URL = "https://www.instagram.com/p/abc123/";

describe("POST /api/v1/place/places (e2e)", () => {
  it("유효한 body는 장소별 그룹(PlaceMatch[]) 구조로 201을 반환한다", async () => {
    scraper.fetchPost.mockResolvedValue(FAKE_POST);
    ai.extract.mockResolvedValue({
      places: [
        {
          place_name: "어니언 성수",
          area_name: "성수동",
          area_type: "landmark",
          relation: "카페",
        },
        {
          place_name: "대림창고",
          area_name: "성수동",
          area_type: "landmark",
          relation: "다음 코스",
        },
      ],
    });
    geocoder.searchAll
      .mockResolvedValueOnce([candidate()])
      .mockResolvedValueOnce([candidate({ placeName: "대림창고" })]);

    const res = await postPlaces(URL);

    expect(res.status).toBe(201);
    const { data } = (await res.json()) as {
      data: Array<{
        extracted: { placeName: string; relation: string };
        matches: Array<{ placeName: string }>;
      }>;
    };
    expect(data).toHaveLength(2);
    expect(data[0].extracted.placeName).toBe("어니언 성수");
    expect(data[0].extracted.relation).toBe("카페");
    expect(data[0].matches[0].placeName).toBe("어니언 성수");
    expect(data[1].extracted.placeName).toBe("대림창고");
    expect(data[1].matches[0].placeName).toBe("대림창고");
  });

  it("모든 장소의 지오코딩이 실패하면 502 GEOCODER_ALL_FAILED를 반환한다", async () => {
    scraper.fetchPost.mockResolvedValue(FAKE_POST);
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
    geocoder.searchAll.mockRejectedValue(new Error("provider down"));

    const res = await postPlaces(URL);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("GEOCODER_ALL_FAILED");
  });

  it("유효하지 않은 body는 400 VALIDATION_ERROR를 반환한다", async () => {
    const res = await fetch(`${baseUrl}/api/v1/place/places`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method: "unknown_method",
        data: { url: "not-a-url" },
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("VALIDATION_ERROR");
  });
});
