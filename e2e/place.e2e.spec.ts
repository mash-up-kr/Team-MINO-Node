import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { ResponseInterceptor } from "../src/common/interceptors/response.interceptor";
import { ScraperService } from "../src/infrastructures/scraper/scraper.service";
import type { ScrapedPost } from "../src/infrastructures/scraper/scraper.type";
import { PlaceModule } from "../src/modules/place/place.module";

// 스크래퍼는 가짜로 대체(네트워크 차단). 이후 단계(AI)가 아직 stub이라 500이 나는 흐름을 검증.
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
    .compile();

  const adapter = new BunHonoAdapter();
  app = moduleRef.createNestApplication(adapter, {
    bufferLogs: true,
    logger: false,
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(0);
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/v1/place/places (e2e)", () => {
  it("유효한 body는 미구현 AI stub으로 인해 500을 반환한다", async () => {
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
    expect(res.status).toBe(500);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("INTERNAL_SERVER_ERROR");
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
