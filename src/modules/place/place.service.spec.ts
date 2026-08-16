import "reflect-metadata";
import { describe, expect, it, jest } from "bun:test";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { AppException } from "../../common/exceptions/app.exception";
import type { AiService } from "../../infrastructures/ai/ai.service";
import type { GeocoderService } from "../../infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../infrastructures/geocoder/geocoder.type";
import type { PlaceImageService } from "../../infrastructures/place-image/place-image.service";
import type { ScraperService } from "../../infrastructures/scraper/scraper.service";
import type { ScrapedPost } from "../../infrastructures/scraper/scraper.type";
import { PlaceController } from "./place.controller";
import { PlaceModule } from "./place.module";
import { PlaceService } from "./place.service";
import {
  type ExtractedPlace,
  type PlaceQuery,
  placeExtractionSchema,
} from "./place.type";

describe("PlaceService", () => {
  const URL = "https://www.instagram.com/p/abc123/";

  const QUERY: PlaceQuery = {
    place_name: "어니언 성수",
    area_name: "성수동",
    area_type: "landmark",
    country_code: "KR",
    relation: "카페 방문 후기",
  };

  const EXTRACTED: ExtractedPlace = {
    placeName: "어니언 성수",
    areaName: "성수동",
    areaType: "landmark",
    countryCode: "KR",
    relation: "카페 방문 후기",
  };

  function makePost(overrides: Partial<ScrapedPost> = {}): ScrapedPost {
    return {
      owner: { id: "1", username: "tester", fullName: "Tester" },
      shortcode: "abc123",
      typename: "image",
      caption: "성수동 카페",
      imageUrls: ["https://img.example/1.jpg"],
      location: null,
      ...overrides,
    };
  }

  function makeCandidate(overrides: Partial<GeoCandidate> = {}): GeoCandidate {
    return {
      provider: "kakao",
      providerPlaceId: "kakao-1",
      placeName: "어니언 성수",
      address: "서울 성동구 아차산로 8",
      coordinate: { lat: 37.5445, lng: 127.0559 },
      ...overrides,
    };
  }

  function createService() {
    const instagram = { fetchPost: jest.fn() };
    const ai = { extract: jest.fn() };
    const geocoder = { search: jest.fn() };
    const placeImage = { storePostImages: jest.fn().mockResolvedValue([]) };
    const service = new PlaceService(
      instagram as unknown as ScraperService,
      ai as unknown as AiService,
      geocoder as unknown as GeocoderService,
      placeImage as unknown as PlaceImageService,
    );
    return { service, instagram, ai, geocoder, placeImage };
  }

  it("scrape → extract → geocode → rank 순서로 파이프라인을 실행한다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.search.mockResolvedValue([makeCandidate()]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(instagram.fetchPost).toHaveBeenCalledWith(URL);
    expect(geocoder.search).toHaveBeenCalledWith({
      placeName: QUERY.place_name,
      areaName: QUERY.area_name,
      areaType: QUERY.area_type,
      countryCode: QUERY.country_code,
    });
    expect(result).toHaveLength(1);
    expect(result[0].extracted).toEqual(EXTRACTED);
    expect(result[0].matches[0]?.placeName).toBe("어니언 성수");
    expect(result[0].matches).toHaveLength(1);
  });

  it("AI가 국가 코드를 소문자로 주면 대문자로 맞춰 전달한다", async () => {
    // given — provider 선택이 코드 일치로 결정되므로 대소문자가 어긋나면 조용히 빈 결과가 된다.
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({
      places: [{ ...QUERY, country_code: "kr" }],
    });
    geocoder.search.mockResolvedValue([makeCandidate()]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(geocoder.search).toHaveBeenCalledWith(
      expect.objectContaining({ countryCode: "KR" }),
    );
    expect(result[0].extracted.countryCode).toBe("KR");
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
          country_code: "KR",
          relation: "다음 코스",
        },
      ],
    });
    geocoder.search
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
    expect(geocoder.search).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].extracted.placeName).toBe("어니언 성수");
    expect(result[0].matches[0]?.placeName).toBe("어니언 성수");
    expect(result[1].extracted.placeName).toBe("대림창고");
    expect(result[1].matches[0]?.placeName).toBe("대림창고");
  });

  it("장소 3개는 3개 그룹으로 나오고 각 그룹은 자기 후보만 담는다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    const places: PlaceQuery[] = ["A", "B", "C"].map((tag) => ({
      place_name: tag,
      area_name: "성수동",
      area_type: "landmark",
      country_code: "KR",
      relation: "코스",
    }));
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places });
    for (const tag of ["A", "B", "C"]) {
      geocoder.search.mockResolvedValueOnce([
        makeCandidate({ placeName: `${tag}-1` }),
        makeCandidate({ placeName: `${tag}-2` }),
      ]);
    }

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result).toHaveLength(3);
    for (const [index, tag] of ["A", "B", "C"].entries()) {
      expect(result[index].extracted.placeName).toBe(tag);
      expect(
        result[index].matches.every((c) => c.placeName.startsWith(tag)),
      ).toBe(true);
    }
  });

  it("일부 쿼리의 지오코딩이 실패해도 나머지는 채우고 실패 장소는 빈 후보로 반환한다", async () => {
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
          country_code: "KR",
          relation: "x",
        },
      ],
    });
    geocoder.search
      .mockResolvedValueOnce([makeCandidate()])
      .mockRejectedValueOnce(new Error("provider down"));

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(geocoder.search).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].matches[0]?.placeName).toBe("어니언 성수");
    expect(result[0].matches).toHaveLength(1);
    expect(result[1].extracted.placeName).toBe("실패 장소");
    expect(result[1].matches[0]).toBeUndefined();
    expect(result[1].matches).toHaveLength(0);
  });

  it("모든 쿼리의 지오코딩이 실패하면 GEOCODER_ALL_FAILED(502)를 던진다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.search.mockRejectedValue(new Error("provider down"));

    // when
    const promise = service.extractFromUrl(URL);

    // then
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "GEOCODER_ALL_FAILED",
    });
  });

  it("프롬프트 + 캡션 + 태그 위치 + 저장된 이미지(gs://)로 멀티모달 content를 구성한다", async () => {
    // given
    const { service, instagram, ai, geocoder, placeImage } = createService();
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
        imageUrls: ["https://scontent.cdninstagram.com/a.jpg"],
      }),
    );
    placeImage.storePostImages.mockResolvedValue([
      { gsUri: "gs://bucket/abc123/0", mediaType: "image/jpeg" },
    ]);
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.search.mockResolvedValue([makeCandidate()]);

    // when
    await service.extractFromUrl(URL);

    // then
    const [schema, content] = ai.extract.mock.calls[0] as [
      unknown,
      Array<{ type: string; text?: string; url?: string; mediaType?: string }>,
    ];
    const texts = content.flatMap((p) => (p.type === "text" ? [p.text] : []));
    const images = content.filter((p) => p.type === "image");
    expect(schema).toBe(placeExtractionSchema);
    expect(texts[0]).toContain("place extraction assistant");
    expect(texts.some((t) => t?.includes("성수동 카페"))).toBe(true);
    expect(texts.some((t) => t?.includes("어니언 성수"))).toBe(true);
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe("gs://bucket/abc123/0");
    expect(images[0].mediaType).toBe("image/jpeg");
  });

  it("지오코딩 결과가 없으면 해당 장소를 빈 후보로 반환한다(에러 아님)", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.search.mockResolvedValue([]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result).toHaveLength(1);
    expect(result[0].extracted).toEqual(EXTRACTED);
    expect(result[0].matches[0]).toBeUndefined();
    expect(result[0].matches).toHaveLength(0);
  });

  it("추출된 장소가 없으면 빈 배열을 반환하고 지오코딩을 호출하지 않는다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [] });

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result).toEqual([]);
    expect(geocoder.search).not.toHaveBeenCalled();
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

  it("정보가 더 완전한 후보를 먼저 정렬한다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.search.mockResolvedValue([
      makeCandidate({
        placeName: "정보 적은 곳",
        coordinate: { lat: 37.1, lng: 127.1 },
      }),
      makeCandidate({
        placeName: "정보 많은 곳",
        coordinate: { lat: 37.2, lng: 127.2 },
        mapUrl: "https://x",
        category: "카페",
      }),
    ]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result[0].matches[0]?.placeName).toBe("정보 많은 곳");
    expect(result[0].matches[0].placeName).toBe("정보 많은 곳");
  });

  it("정보 완전도가 같으면 더 가까운 후보를 먼저 정렬한다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.search.mockResolvedValue([
      makeCandidate({
        placeName: "먼 후보",
        coordinate: { lat: 37.1, lng: 127.1 },
        distance: 1200,
      }),
      makeCandidate({
        placeName: "가까운 후보",
        coordinate: { lat: 37.2, lng: 127.2 },
        distance: 300,
      }),
    ]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result[0].matches[0]?.placeName).toBe("가까운 후보");
  });

  it("PlaceModule이 PlaceService와 PlaceController를 해석한다", async () => {
    // given
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          // PlaceImageService 생성자가 요구하는 최소 env.
          load: [() => ({ GOOGLE_CLOUD_PROJECT: "test" })],
        }),
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
