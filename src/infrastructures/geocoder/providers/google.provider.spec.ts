import { afterEach, describe, expect, it, jest } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import { AppException } from "../../../common/exceptions/app.exception";
import type { Env } from "../../../config/env.schema";
import type { GeoQuery } from "../geocoder.type";
import { GoogleProvider } from "./google.provider";

const originalFetch = globalThis.fetch;
const overseasQuery: GeoQuery = {
  areaName: "Paris",
  areaType: "landmark",
  placeName: "Eiffel Tower",
  countryCode: "FR",
};

function createProvider() {
  const configService = {
    getOrThrow: jest.fn(() => "test-api-key"),
  } as unknown as ConfigService<Env>;

  return new GoogleProvider(configService);
}

function createGoogleResponse(overrides: Record<string, unknown> = {}) {
  return {
    places: [
      {
        id: "ChIJLU7jZClu5kcR4PcOOO6p3I0",
        displayName: { text: "에펠탑", languageCode: "ko" },
        formattedAddress: "Av. Gustave Eiffel, 75007 Paris, France",
        location: { latitude: 48.85837, longitude: 2.294481 },
        googleMapsUri: "https://maps.google.com/?cid=1",
        internationalPhoneNumber: "+33 892 70 12 39",
        primaryTypeDisplayName: { text: "관광 명소", languageCode: "ko" },
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

function readRequest(fetchMock: jest.Mock) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url: new URL(url),
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
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

describe("GoogleProvider", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("전 세계를 색인하므로 국가로 거르지 않는다", () => {
    const provider = createProvider();

    expect(provider.supports(overseasQuery)).toBe(true);
    expect(provider.supports({ ...overseasQuery, countryCode: "KR" })).toBe(
      true,
    );
  });

  it("searchText를 API 키와 FieldMask 헤더로 호출한다", async () => {
    const fetchMock = mockFetchJson(createGoogleResponse());
    const provider = createProvider();

    await provider.search(overseasQuery);

    const { url, headers } = readRequest(fetchMock);
    expect(url.origin).toBe("https://places.googleapis.com");
    expect(url.pathname).toBe("/v1/places:searchText");
    expect(headers["X-Goog-Api-Key"]).toBe("test-api-key");
    // FieldMask가 곧 과금 티어라 GeoCandidate로 매핑하는 필드만 요청해야 한다.
    expect(headers["X-Goog-FieldMask"].split(",")).toEqual([
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.googleMapsUri",
      "places.internationalPhoneNumber",
      "places.primaryTypeDisplayName",
    ]);
  });

  it("지역·언어·후보 수를 담아 단일 textQuery로 요청한다", async () => {
    const fetchMock = mockFetchJson(createGoogleResponse());
    const provider = createProvider();

    await provider.search(overseasQuery);

    const { body } = readRequest(fetchMock);
    // 주소와 상호명을 한 문자열로 처리하므로 Kakao 같은 2단계 주소 검색이 없다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body.textQuery).toBe("Paris Eiffel Tower");
    expect(body.regionCode).toBe("FR");
    expect(body.languageCode).toBe("ko");
    expect(body.maxResultCount).toBe(5);
  });

  it("Google 응답을 GeoCandidate로 정규화한다", async () => {
    mockFetchJson(createGoogleResponse());
    const provider = createProvider();

    const result = await provider.search(overseasQuery);

    expect(result).toEqual([
      {
        provider: "google",
        providerPlaceId: "ChIJLU7jZClu5kcR4PcOOO6p3I0",
        placeName: "에펠탑",
        address: "Av. Gustave Eiffel, 75007 Paris, France",
        coordinate: { lat: 48.85837, lng: 2.294481 },
        mapUrl: "https://maps.google.com/?cid=1",
        phone: "+33 892 70 12 39",
        category: "관광 명소",
      },
    ]);
  });

  it("searchText는 거리를 주지 않으므로 distance를 비운다", async () => {
    mockFetchJson(createGoogleResponse());
    const provider = createProvider();

    const [candidate] = await provider.search(overseasQuery);

    expect(candidate.distance).toBeUndefined();
  });

  it("결과가 없으면 places 키가 빠지며 빈 배열을 반환한다", async () => {
    mockFetchJson({});
    const provider = createProvider();

    const result = await provider.search(overseasQuery);

    expect(result).toEqual([]);
  });

  it("값이 없는 선택 필드는 생략된 채로 온다", async () => {
    // Kakao는 빈 문자열을 주지만 Google은 필드 자체를 뺀다.
    mockFetchJson({
      places: [
        {
          id: "place-1",
          displayName: { text: "이름만 있는 곳" },
          location: { latitude: 1, longitude: 2 },
        },
      ],
    });
    const provider = createProvider();

    const [candidate] = await provider.search(overseasQuery);

    expect(candidate.address).toBe("");
    expect(candidate.mapUrl).toBeUndefined();
    expect(candidate.phone).toBeUndefined();
    expect(candidate.category).toBeUndefined();
  });

  it("fetch가 실패하면 GOOGLE_REQUEST_FAILED를 던진다", async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network error")) as unknown as typeof fetch;
    const provider = createProvider();

    await expectAppException(
      provider.search(overseasQuery),
      "GOOGLE_REQUEST_FAILED",
    );
  });

  it("429 응답이면 GOOGLE_RATE_LIMITED를 던진다", async () => {
    mockFetchJson({ error: "rate limited" }, { status: 429 });
    const provider = createProvider();

    await expectAppException(
      provider.search(overseasQuery),
      "GOOGLE_RATE_LIMITED",
    );
  });

  it("2xx 응답이 아니면 GOOGLE_REQUEST_FAILED를 던진다", async () => {
    mockFetchJson({ error: "bad gateway" }, { status: 502 });
    const provider = createProvider();

    await expectAppException(
      provider.search(overseasQuery),
      "GOOGLE_REQUEST_FAILED",
    );
  });

  it("응답 형식이 다르면 GOOGLE_RESPONSE_INVALID를 던진다", async () => {
    mockFetchJson(
      createGoogleResponse({ location: { latitude: "not-a-number" } }),
    );
    const provider = createProvider();

    await expectAppException(
      provider.search(overseasQuery),
      "GOOGLE_RESPONSE_INVALID",
    );
  });
});
