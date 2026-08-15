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
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { AiService } from "../../../src/infrastructures/ai/ai.service";
import { GEOCODER_PROVIDERS } from "../../../src/infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../../src/infrastructures/geocoder/geocoder.type";
import { PlaceImageService } from "../../../src/infrastructures/place-image/place-image.service";
import { InstagramProvider } from "../../../src/infrastructures/scraper/providers/instagram.provider";
import type { ScrapedPost } from "../../../src/infrastructures/scraper/scraper.type";
import { SentryErrorReporter } from "../../../src/infrastructures/sentry/sentry-reporter";
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
  country_code: "KR",
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
const geocoder = { name: "kakao", supports: () => true, search: jest.fn() };
const placeImage = { storePostImages: jest.fn().mockResolvedValue([]) };
let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(InstagramProvider)
      .useValue(instagram)
      .overrideProvider(AiService)
      .useValue(ai)
      .overrideProvider(GEOCODER_PROVIDERS)
      .useValue([geocoder])
      .overrideProvider(PlaceImageService)
      .useValue(placeImage)
      .overrideProvider(SentryErrorReporter)
      .useValue({ report: () => undefined }),
  ));
});

beforeEach(() => {
  instagram.fetchPost.mockReset();
  ai.extract.mockReset();
  geocoder.search.mockReset();
  instagram.fetchPost.mockResolvedValue(POST);
  ai.extract.mockResolvedValue({ places: [PLACE_QUERY] });
  geocoder.search.mockResolvedValue([CANDIDATE]);
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

describe("POST /api/v1/place/places", () => {
  it("외부 경계를 제외한 실제 파이프라인을 거쳐 201을 반환한다", async () => {
    const response = await postPlaces({
      method: "instagram_url",
      data: { url: POST_URL },
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      data: [
        {
          extracted: {
            placeName: "어니언 성수",
            areaName: "성수동",
            areaType: "landmark",
            countryCode: "KR",
            relation: "카페",
          },
          matches: [CANDIDATE],
        },
      ],
    });
    expect(instagram.fetchPost).toHaveBeenCalledWith(POST_URL);
    expect(geocoder.search).toHaveBeenCalledWith({
      placeName: "어니언 성수",
      areaName: "성수동",
      areaType: "landmark",
      countryCode: "KR",
    });
  });

  it("모든 지오코딩이 실패하면 502를 반환한다", async () => {
    geocoder.search.mockRejectedValue(new Error("provider down"));

    const response = await postPlaces({
      method: "instagram_url",
      data: { url: POST_URL },
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      errorCode: "GEOCODER_ALL_FAILED",
      message: "장소 검색이 모두 실패했습니다.",
    });
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
  });
});
