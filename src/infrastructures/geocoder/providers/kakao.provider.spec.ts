import { afterEach, describe, expect, it, jest } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import { AppException } from "../../../common/exceptions/app.exception";
import type { Env } from "../../../config/env.schema";
import type { GeoQuery } from "../geocoder.type";
import { KakaoProvider } from "./kakao.provider";

const originalFetch = globalThis.fetch;
const regionQuery: GeoQuery = {
  areaName: "서울 강남구",
  areaType: "region",
  placeName: "카카오프렌즈",
  countryCode: "KR",
};
const addressQuery: GeoQuery = {
  areaName: "서울 강남구 영동대로 513",
  areaType: "address",
  placeName: "카카오프렌즈",
  countryCode: "KR",
};
const landmarkQuery: GeoQuery = {
  areaName: "코엑스",
  areaType: "landmark",
  placeName: "카카오프렌즈",
  countryCode: "KR",
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

function createKakaoAddressResponse(overrides: Record<string, unknown> = {}) {
  return {
    meta: {
      total_count: 1,
      pageable_count: 1,
      is_end: true,
    },
    documents: [
      {
        address_name: "서울 강남구 영동대로 513",
        address_type: "ROAD_ADDR",
        x: "127.05915981238964",
        y: "37.51182391270859",
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

function mockFetchJsonSequence(
  responses: Array<{ body: unknown; init?: ResponseInit }>,
) {
  const fetchMock = jest.fn();

  for (const { body, init = {} } of responses) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
        ...init,
      }),
    );
  }

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

  it("국내 질의만 지원한다", () => {
    const provider = createProvider();

    expect(provider.supports(regionQuery)).toBe(true);
    // 해외 질의를 보내면 0건이 아니라 이름이 겹치는 국내 장소가 걸릴 수 있어 먼저 거른다.
    expect(provider.supports({ ...regionQuery, countryCode: "FR" })).toBe(
      false,
    );
    expect(provider.supports({ ...regionQuery, countryCode: "JP" })).toBe(
      false,
    );
  });

  it("keyword search API를 올바른 query와 인증 헤더로 호출한다", async () => {
    const fetchMock = mockFetchJson(createKakaoResponse());
    const provider = createProvider();

    await provider.search(regionQuery);

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

  it("address 타입이면 주소 좌표를 기준으로 keyword search를 호출한다", async () => {
    const fetchMock = mockFetchJsonSequence([
      { body: createKakaoAddressResponse() },
      { body: createKakaoResponse({ distance: "120" }) },
    ]);
    const provider = createProvider();

    await provider.search(addressQuery);

    const [addressUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const addressRequestUrl = new URL(addressUrl);
    expect(addressRequestUrl.pathname).toBe("/v2/local/search/address.json");
    expect(addressRequestUrl.searchParams.get("query")).toBe(
      "서울 강남구 영동대로 513",
    );
    expect(addressRequestUrl.searchParams.get("size")).toBe("1");

    const [keywordUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    const keywordRequestUrl = new URL(keywordUrl);
    expect(keywordRequestUrl.pathname).toBe("/v2/local/search/keyword.json");
    expect(keywordRequestUrl.searchParams.get("query")).toBe("카카오프렌즈");
    expect(keywordRequestUrl.searchParams.get("x")).toBe("127.05915981238964");
    expect(keywordRequestUrl.searchParams.get("y")).toBe("37.51182391270859");
    expect(keywordRequestUrl.searchParams.get("radius")).toBe("1000");
    expect(keywordRequestUrl.searchParams.get("sort")).toBe("distance");
    expect(keywordRequestUrl.searchParams.get("size")).toBe("15");
  });

  it("landmark 타입이면 기존 keyword search를 호출한다", async () => {
    const fetchMock = mockFetchJson(createKakaoResponse());
    const provider = createProvider();

    await provider.search(landmarkQuery);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [keywordUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const keywordRequestUrl = new URL(keywordUrl);
    expect(keywordRequestUrl.pathname).toBe("/v2/local/search/keyword.json");
    expect(keywordRequestUrl.searchParams.get("query")).toBe(
      "코엑스 카카오프렌즈",
    );
    expect(keywordRequestUrl.searchParams.get("x")).toBeNull();
    expect(keywordRequestUrl.searchParams.get("sort")).toBeNull();
  });

  it("address coordinate 결과가 없으면 기존 keyword search로 fallback한다", async () => {
    const fetchMock = mockFetchJsonSequence([
      {
        body: {
          meta: { total_count: 0, pageable_count: 0, is_end: true },
          documents: [],
        },
      },
      { body: createKakaoResponse() },
    ]);
    const provider = createProvider();

    await provider.search(addressQuery);

    const [keywordUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    const keywordRequestUrl = new URL(keywordUrl);
    expect(keywordRequestUrl.searchParams.get("query")).toBe(
      "서울 강남구 영동대로 513 카카오프렌즈",
    );
    expect(keywordRequestUrl.searchParams.get("x")).toBeNull();
    expect(keywordRequestUrl.searchParams.get("sort")).toBeNull();
  });

  it("address coordinate 요청이 실패하면 기존 keyword search로 fallback한다", async () => {
    const fetchMock = mockFetchJsonSequence([
      { body: { error: "bad gateway" }, init: { status: 502 } },
      { body: createKakaoResponse() },
    ]);
    const provider = createProvider();

    await provider.search(addressQuery);

    const [keywordUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    const keywordRequestUrl = new URL(keywordUrl);
    expect(keywordRequestUrl.searchParams.get("query")).toBe(
      "서울 강남구 영동대로 513 카카오프렌즈",
    );
    expect(keywordRequestUrl.searchParams.get("x")).toBeNull();
    expect(keywordRequestUrl.searchParams.get("sort")).toBeNull();
  });

  it("biased 검색이 0건이면 기존 keyword search로 fallback한다", async () => {
    const fetchMock = mockFetchJsonSequence([
      { body: createKakaoAddressResponse() },
      { body: { documents: [] } },
      { body: createKakaoResponse() },
    ]);
    const provider = createProvider();

    const candidates = await provider.search(addressQuery);

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [biasedUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    const biasedRequestUrl = new URL(biasedUrl);
    expect(biasedRequestUrl.searchParams.get("radius")).toBe("1000");
    expect(biasedRequestUrl.searchParams.get("sort")).toBe("distance");

    const [keywordUrl] = fetchMock.mock.calls[2] as [string, RequestInit];
    const keywordRequestUrl = new URL(keywordUrl);
    expect(keywordRequestUrl.searchParams.get("query")).toBe(
      "서울 강남구 영동대로 513 카카오프렌즈",
    );
    expect(keywordRequestUrl.searchParams.get("x")).toBeNull();
    expect(keywordRequestUrl.searchParams.get("sort")).toBeNull();
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("Kakao 응답을 GeoCandidate로 정규화한다", async () => {
    mockFetchJson(createKakaoResponse());
    const provider = createProvider();

    const result = await provider.search(regionQuery);

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
        category: "가정,생활 > 문구,사무용품 > 디자인문구 > 카카오프렌즈",
      },
    ]);
  });

  it("distance가 없거나 빈 문자열이면 distance를 생략한다", async () => {
    mockFetchJson(createKakaoResponse({ distance: "" }));
    const provider = createProvider();

    const [candidate] = await provider.search(regionQuery);

    expect(candidate.distance).toBeUndefined();
  });

  it("fetch가 실패하면 KAKAO_REQUEST_FAILED를 던진다", async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network error")) as unknown as typeof fetch;
    const provider = createProvider();

    await expectAppException(
      provider.search(regionQuery),
      "KAKAO_REQUEST_FAILED",
    );
  });

  it("429 응답이면 KAKAO_RATE_LIMITED를 던진다", async () => {
    mockFetchJson({ error: "rate limited" }, { status: 429 });
    const provider = createProvider();

    await expectAppException(
      provider.search(regionQuery),
      "KAKAO_RATE_LIMITED",
    );
  });

  it("2xx 응답이 아니면 KAKAO_REQUEST_FAILED를 던진다", async () => {
    mockFetchJson({ error: "bad gateway" }, { status: 502 });
    const provider = createProvider();

    await expectAppException(
      provider.search(regionQuery),
      "KAKAO_REQUEST_FAILED",
    );
  });

  it("응답 형식이 다르면 KAKAO_RESPONSE_INVALID를 던진다", async () => {
    mockFetchJson(createKakaoResponse({ x: "not-a-number" }));
    const provider = createProvider();

    await expectAppException(
      provider.search(regionQuery),
      "KAKAO_RESPONSE_INVALID",
    );
  });
});
