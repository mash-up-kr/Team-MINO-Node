import { afterEach, describe, expect, it, jest } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import { AppException } from "../../../common/exceptions/app.exception";
import type { Env } from "../../../config/env.schema";
import type { GeoQuery } from "../geocoder.type";
import { KakaoProvider } from "./kakao.provider";

const originalFetch = globalThis.fetch;
const query: GeoQuery = {
  areaName: "서울 강남구",
  areaType: "landmark",
  placeName: "카카오프렌즈",
};

function createProvider() {
  const configService = {
    getOrThrow: jest.fn(() => "test-api-key"),
  } as unknown as ConfigService<Env>;

  return new KakaoProvider(configService);
}

function createKakaoResponse(overrides: Record<string, unknown> = {}) {
  return {
    meta: {
      same_name: {
        region: [],
        keyword: "카카오프렌즈",
        selected_region: "",
      },
      pageable_count: 1,
      total_count: 1,
      is_end: true,
    },
    documents: [
      {
        id: "26338954",
        place_name: "카카오프렌즈 코엑스점",
        category_name: "가정,생활 > 문구,사무용품 > 디자인문구 > 카카오프렌즈",
        category_group_code: "",
        category_group_name: "",
        phone: "02-6002-1880",
        address_name: "서울 강남구 삼성동 159",
        road_address_name: "서울 강남구 영동대로 513",
        x: "127.05902969025047",
        y: "37.51207412593136",
        place_url: "http://place.map.kakao.com/26338954",
        distance: "418",
        ...overrides,
      },
    ],
  };
}

function mockFetchJson(body: unknown, init: ResponseInit = {}) {
  const fetchMock = jest.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function expectAppException(
  promise: Promise<unknown>,
  errorCode: string,
) {
  const error = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );

  expect(error).toBeInstanceOf(AppException);
  expect(error).toMatchObject({ errorCode });
}

describe("KakaoProvider", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("keyword search API를 올바른 query와 인증 헤더로 호출한다", async () => {
    const fetchMock = mockFetchJson(createKakaoResponse());
    const provider = createProvider();

    await provider.search(query);

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    const requestUrl = new URL(url);
    expect(requestUrl.origin).toBe("https://dapi.kakao.com");
    expect(requestUrl.pathname).toBe("/v2/local/search/keyword.json");
    expect(requestUrl.searchParams.get("query")).toBe(
      "서울 강남구 카카오프렌즈",
    );
    expect(requestUrl.searchParams.get("size")).toBe("15");
    expect(init?.headers).toEqual({
      Authorization: "KakaoAK test-api-key",
    });
  });

  it("Kakao 응답을 GeoCandidate로 정규화한다", async () => {
    mockFetchJson(createKakaoResponse());
    const provider = createProvider();

    const result = await provider.search(query);

    expect(result).toEqual([
      {
        provider: "kakao",
        providerPlaceId: "26338954",
        placeName: "카카오프렌즈 코엑스점",
        address: "서울 강남구 삼성동 159",
        coordinate: {
          lat: 37.51207412593136,
          lng: 127.05902969025047,
        },
        distance: 418,
        mapUrl: "http://place.map.kakao.com/26338954",
        phone: "02-6002-1880",
        category: "가정,생활 > 문구,사무용품 > 디자인문구 > 카카오프렌즈",
      },
    ]);
  });

  it("distance가 없거나 빈 문자열이면 distance를 생략한다", async () => {
    mockFetchJson(createKakaoResponse({ distance: "" }));
    const provider = createProvider();

    const [candidate] = await provider.search(query);

    expect(candidate.distance).toBeUndefined();
  });

  it("429 응답이면 KAKAO_RATE_LIMITED를 던진다", async () => {
    mockFetchJson({ error: "rate limited" }, { status: 429 });
    const provider = createProvider();

    await expectAppException(provider.search(query), "KAKAO_RATE_LIMITED");
  });

  it("2xx 응답이 아니면 KAKAO_REQUEST_FAILED를 던진다", async () => {
    mockFetchJson({ error: "bad gateway" }, { status: 502 });
    const provider = createProvider();

    await expectAppException(provider.search(query), "KAKAO_REQUEST_FAILED");
  });

  it("응답 형식이 다르면 KAKAO_RESPONSE_INVALID를 던진다", async () => {
    mockFetchJson(createKakaoResponse({ x: "not-a-number" }));
    const provider = createProvider();

    await expectAppException(provider.search(query), "KAKAO_RESPONSE_INVALID");
  });
});
