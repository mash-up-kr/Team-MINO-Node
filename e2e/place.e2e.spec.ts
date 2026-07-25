import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { ResponseInterceptor } from "../src/common/interceptors/response.interceptor";
import { AiService } from "../src/infrastructures/ai/ai.service";
import { GeocoderService } from "../src/infrastructures/geocoder/geocoder.service";
import { ScraperService } from "../src/infrastructures/scraper/scraper.service";
import type { ScrapedPost } from "../src/infrastructures/scraper/scraper.type";
import { PlaceModule } from "../src/modules/place/place.module";

// 외부 제공자를 가짜로 대체해, 네트워크·인증 상태와 무관하게 API 계약을 검증한다.
const FAKE_POST: ScrapedPost = {
  shortcode: "abc123",
  typename: "image",
  caption: "성수동 카페",
  imageUrls: ["https://cdn.example/1.jpg"],
  owner: { id: "1", username: "tester", fullName: "테스터" },
  location: null,
};

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
    .useValue({ fetchPost: async () => FAKE_POST })
    .overrideProvider(AiService)
    .useValue({
      extract: async () => ({
        places: [
          {
            place_name: "테스트 카페",
            area_name: "성수동",
            area_type: "region",
            relation: "게시물에 언급된 카페",
          },
        ],
      }),
    })
    .overrideProvider(GeocoderService)
    .useValue({
      searchAll: async () => [
        {
          provider: "kakao",
          providerPlaceId: "test-place-id",
          placeName: "테스트 카페",
          address: "서울 성동구 성수동",
          coordinate: { lat: 37.544, lng: 127.056 },
        },
      ],
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
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/v1/place/places (e2e)", () => {
  it("유효한 body는 추출한 장소를 반환한다", async () => {
    // given
    const requestBody = {
      method: "instagram_url",
      data: { url: "https://www.instagram.com/p/abc123/" },
    };

    // when
    const res = await fetch(`${baseUrl}/api/v1/place/places`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    // then
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: Array<{ placeName: string }>;
    };
    expect(body.data).toEqual([
      expect.objectContaining({ placeName: "테스트 카페" }),
    ]);
  });

  it("유효하지 않은 body는 400 VALIDATION_ERROR를 반환한다", async () => {
    // given
    const requestBody = {
      method: "unknown_method",
      data: { url: "not-a-url" },
    };

    // when
    const res = await fetch(`${baseUrl}/api/v1/place/places`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    // then
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("VALIDATION_ERROR");
  });
});
