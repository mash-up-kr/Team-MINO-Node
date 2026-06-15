import "reflect-metadata";
import { describe, expect, it, jest } from "bun:test";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { AppException } from "../../common/exceptions/app.exception";
import type { AiService } from "../../infrastructures/ai/ai.service";
import type { GeocoderService } from "../../infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../infrastructures/geocoder/geocoder.type";
import type { InstagramService } from "../../infrastructures/instagram/instagram.service";
import type { ScrapedPost } from "../../infrastructures/instagram/instagram.type";
import { PlaceController } from "./place.controller";
import { PlaceModule } from "./place.module";
import { PlaceService } from "./place.service";
import { type PlaceQuery, placeExtractionSchema } from "./place.type";

describe("PlaceService", () => {
  const URL = "https://www.instagram.com/p/abc123/";

  const QUERY: PlaceQuery = {
    place_name: "어니언 성수",
    area_name: "성수동",
    area_type: "landmark",
    relation: "카페 방문 후기",
  };

  function makePost(overrides: Partial<ScrapedPost> = {}): ScrapedPost {
    return {
      shortcode: "abc123",
      typename: "GraphImage",
      caption: "성수동 카페",
      isVideo: false,
      imageUrls: ["https://img.example/1.jpg"],
      location: null,
      ...overrides,
    };
  }

  function makeCandidate(overrides: Partial<GeoCandidate> = {}): GeoCandidate {
    return {
      provider: "kakao",
      placeName: "어니언 성수",
      address: "서울 성동구 아차산로 8",
      coordinate: { lat: 37.5445, lng: 127.0559 },
      ...overrides,
    };
  }

  function createService() {
    const instagram = { fetchPost: jest.fn() };
    const ai = { extract: jest.fn() };
    const geocoder = { searchAll: jest.fn() };
    const service = new PlaceService(
      instagram as unknown as InstagramService,
      ai as unknown as AiService,
      geocoder as unknown as GeocoderService,
    );
    return { service, instagram, ai, geocoder };
  }

  it("scrape → extract → geocode → rank 순서로 파이프라인을 실행한다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockResolvedValue([makeCandidate()]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(instagram.fetchPost).toHaveBeenCalledWith(URL);
    expect(geocoder.searchAll).toHaveBeenCalledWith({
      placeName: QUERY.place_name,
      areaName: QUERY.area_name,
    });
    expect(result).toHaveLength(1);
  });

  it("여러 장소가 추출되면 각각 지오코딩한 뒤 결과를 합쳐 랭킹한다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({
      places: [
        QUERY,
        {
          place_name: "대림창고",
          area_name: "성수동",
          area_type: "landmark",
          relation: "다음 코스",
        },
      ],
    });
    geocoder.searchAll
      .mockResolvedValueOnce([makeCandidate()])
      .mockResolvedValueOnce([
        makeCandidate({
          placeName: "대림창고",
          coordinate: { lat: 37.5412, lng: 127.0561 },
        }),
      ]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(geocoder.searchAll).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it("일부 쿼리의 지오코딩이 실패해도 성공한 결과만 모아 반환한다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({
      places: [
        QUERY,
        {
          place_name: "실패 장소",
          area_name: "성수동",
          area_type: "landmark",
          relation: "x",
        },
      ],
    });
    geocoder.searchAll
      .mockResolvedValueOnce([makeCandidate()])
      .mockRejectedValueOnce(new Error("provider down"));

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(geocoder.searchAll).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it("모든 쿼리의 지오코딩이 실패하면 GEOCODER_ALL_FAILED(502)를 던진다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockRejectedValue(new Error("provider down"));

    // when
    const promise = service.extractFromUrl(URL);

    // then
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "GEOCODER_ALL_FAILED",
    });
  });

  it("프롬프트 + 캡션 + 태그 위치 + 이미지로 멀티모달 content를 구성한다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(
      makePost({
        caption: "성수동 카페",
        location: {
          id: "1",
          name: "어니언 성수",
          slug: "onion",
          hasPublicPage: true,
          address: null,
        },
        imageUrls: ["https://img.example/a.jpg"],
      }),
    );
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockResolvedValue([makeCandidate()]);

    // when
    await service.extractFromUrl(URL);

    // then
    const [schema, content] = ai.extract.mock.calls[0] as [
      unknown,
      Array<{ type: string; text?: string; url?: string }>,
    ];
    const texts = content.flatMap((p) => (p.type === "text" ? [p.text] : []));
    const images = content.filter((p) => p.type === "image");
    expect(schema).toBe(placeExtractionSchema);
    expect(texts[0]).toContain("place extraction assistant");
    expect(texts.some((t) => t?.includes("성수동 카페"))).toBe(true);
    expect(texts.some((t) => t?.includes("어니언 성수"))).toBe(true);
    expect(images).toHaveLength(1);
  });

  it("지오코딩 결과가 없으면 GEOCODER_NO_RESULTS(404)를 던진다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockResolvedValue([]);

    // when
    const promise = service.extractFromUrl(URL);

    // then
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "GEOCODER_NO_RESULTS",
    });
  });

  it("인프라 서비스의 에러를 그대로 전파한다", async () => {
    // given
    const { service, instagram } = createService();
    instagram.fetchPost.mockRejectedValue(new Error("Not implemented"));

    // when
    const promise = service.extractFromUrl(URL);

    // then
    await expect(promise).rejects.toThrow("Not implemented");
  });

  it("provider가 다른 동일 장소를 중복 제거하고 필드를 병합한다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockResolvedValue([
      makeCandidate({ provider: "kakao", phone: "02-111-2222" }),
      makeCandidate({ provider: "google", url: "https://maps.example/onion" }),
    ]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result).toHaveLength(1);
    expect(result[0].phone).toBe("02-111-2222");
    expect(result[0].url).toBe("https://maps.example/onion");
  });

  it("정보가 더 완전한 후보를 먼저 정렬한다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockResolvedValue([
      makeCandidate({
        placeName: "정보 적은 곳",
        coordinate: { lat: 37.1, lng: 127.1 },
      }),
      makeCandidate({
        placeName: "정보 많은 곳",
        coordinate: { lat: 37.2, lng: 127.2 },
        url: "https://x",
        phone: "02-000",
        category: "카페",
      }),
    ]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result[0].placeName).toBe("정보 많은 곳");
  });

  it("PlaceModule이 PlaceService와 PlaceController를 해석한다", async () => {
    // given
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PlaceModule,
      ],
    }).compile();

    // when
    const service = module.get(PlaceService);
    const controller = module.get(PlaceController);

    // then
    expect(service).toBeInstanceOf(PlaceService);
    expect(controller).toBeInstanceOf(PlaceController);
  });
});
