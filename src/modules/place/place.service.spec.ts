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
    image_indices: [],
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
    const geocoder = { searchAll: jest.fn() };
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
    geocoder.searchAll.mockResolvedValue([makeCandidate()]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(instagram.fetchPost).toHaveBeenCalledWith(URL);
    expect(geocoder.searchAll).toHaveBeenCalledWith({
      placeName: QUERY.place_name,
      areaName: QUERY.area_name,
      areaType: QUERY.area_type,
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].extracted).toEqual({
      placeName: "어니언 성수",
      areaName: "성수동",
      areaType: "landmark",
      relation: "카페 방문 후기",
    });
    expect(result.matches[0].matches[0]?.placeName).toBe("어니언 성수");
    expect(result.matches[0].matches).toHaveLength(1);
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
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].extracted.placeName).toBe("어니언 성수");
    expect(result.matches[0].matches[0]?.placeName).toBe("어니언 성수");
    expect(result.matches[1].extracted.placeName).toBe("대림창고");
    expect(result.matches[1].matches[0]?.placeName).toBe("대림창고");
  });

  it("장소 3개는 3개 그룹으로 나오고 각 그룹은 자기 후보만 담는다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    const places: PlaceQuery[] = ["A", "B", "C"].map((tag) => ({
      place_name: tag,
      area_name: "성수동",
      area_type: "landmark",
      relation: "코스",
      image_indices: [],
    }));
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places });
    for (const tag of ["A", "B", "C"]) {
      geocoder.searchAll.mockResolvedValueOnce([
        makeCandidate({ placeName: `${tag}-1` }),
        makeCandidate({ placeName: `${tag}-2` }),
      ]);
    }

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result.matches).toHaveLength(3);
    for (const [index, tag] of ["A", "B", "C"].entries()) {
      expect(result.matches[index].extracted.placeName).toBe(tag);
      expect(
        result.matches[index].matches.every((c) => c.placeName.startsWith(tag)),
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
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].matches[0]?.placeName).toBe("어니언 성수");
    expect(result.matches[0].matches).toHaveLength(1);
    expect(result.matches[1].extracted.placeName).toBe("실패 장소");
    expect(result.matches[1].matches[0]).toBeUndefined();
    expect(result.matches[1].matches).toHaveLength(0);
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

  it("모델이 고른 인덱스만 그 장소의 이미지로 담는다", async () => {
    // given
    const { service, instagram, ai, geocoder, placeImage } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    placeImage.storePostImages.mockResolvedValue([
      {
        gsUri: "gs://b/0",
        publicUrl: "https://img/0",
        mediaType: "image/jpeg",
      },
      {
        gsUri: "gs://b/1",
        publicUrl: "https://img/1",
        mediaType: "image/jpeg",
      },
      {
        gsUri: "gs://b/2",
        publicUrl: "https://img/2",
        mediaType: "image/jpeg",
      },
    ]);
    ai.extract.mockResolvedValue({
      places: [
        { ...QUERY, image_indices: [2, 0] },
        { ...QUERY, place_name: "대림창고", image_indices: [1] },
      ],
    });
    geocoder.searchAll.mockResolvedValue([makeCandidate()]);

    // when
    const { matches } = await service.extractFromUrl(URL);

    // then — 인덱스순 정렬, 장소별 부분집합
    expect(matches[0].images).toEqual(["https://img/0", "https://img/2"]);
    expect(matches[1].images).toEqual(["https://img/1"]);
  });

  it("인덱스가 전부 무효(범위 밖·중복·누락)면 게시물 전체 이미지로 폴백한다", async () => {
    // given
    const { service, instagram, ai, geocoder, placeImage } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    placeImage.storePostImages.mockResolvedValue([
      {
        gsUri: "gs://b/0",
        publicUrl: "https://img/0",
        mediaType: "image/jpeg",
      },
      {
        gsUri: "gs://b/1",
        publicUrl: "https://img/1",
        mediaType: "image/jpeg",
      },
    ]);
    ai.extract.mockResolvedValue({
      places: [
        { ...QUERY, image_indices: [9, -1, 1.5] },
        // 검증을 안 거친 입력(테스트 mock 등)은 필드 자체가 없을 수 있다
        { ...QUERY, place_name: "대림창고", image_indices: undefined },
      ],
    });
    geocoder.searchAll.mockResolvedValue([makeCandidate()]);

    // when
    const { matches } = await service.extractFromUrl(URL);

    // then
    expect(matches[0].images).toEqual(["https://img/0", "https://img/1"]);
    expect(matches[1].images).toEqual(["https://img/0", "https://img/1"]);
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
          lat: 37.5445,
          lng: 127.0559,
        },
        imageUrls: ["https://scontent.cdninstagram.com/a.jpg"],
      }),
    );
    placeImage.storePostImages.mockResolvedValue([
      {
        gsUri: "gs://bucket/abc123/0",
        publicUrl: "https://storage.googleapis.com/bucket/abc123/0",
        mediaType: "image/jpeg",
      },
    ]);
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockResolvedValue([makeCandidate()]);

    // when
    await service.extractFromUrl(URL);

    // then
    const [schema, content] = ai.extract.mock.calls[0] as [
      typeof placeExtractionSchema,
      Array<{ type: string; text?: string; url?: string; mediaType?: string }>,
    ];
    const texts = content.flatMap((p) => (p.type === "text" ? [p.text] : []));
    const images = content.filter((p) => p.type === "image");
    const prompt = texts[0] ?? "";
    expect(schema).toBe(placeExtractionSchema);
    expect(prompt).toContain("place extraction assistant");
    expect(prompt).toContain("qualifying visitable destination");
    expect(prompt).toContain("infrastructure never qualify as place_name");
    expect(prompt).toContain("return an empty places array");
    expect(texts.some((t) => t?.includes("성수동 카페"))).toBe(true);
    expect(texts.some((t) => t?.includes("어니언 성수"))).toBe(true);
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe("gs://bucket/abc123/0");
    expect(images[0].mediaType).toBe("image/jpeg");
  });

  it("이미지마다 바로 앞에 [image N] 라벨을 붙여 모델이 인덱스를 세지 않게 한다", async () => {
    // given
    const { service, instagram, ai, geocoder, placeImage } = createService();
    instagram.fetchPost.mockResolvedValue(
      makePost({
        imageUrls: [
          "https://scontent.cdninstagram.com/a.jpg",
          "https://scontent.cdninstagram.com/b.jpg",
        ],
      }),
    );
    placeImage.storePostImages.mockResolvedValue([
      {
        gsUri: "gs://bucket/abc123/0",
        publicUrl: "https://storage.googleapis.com/bucket/abc123/0",
        mediaType: "image/jpeg",
      },
      {
        gsUri: "gs://bucket/abc123/1",
        publicUrl: "https://storage.googleapis.com/bucket/abc123/1",
        mediaType: "image/jpeg",
      },
    ]);
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockResolvedValue([makeCandidate()]);

    // when
    await service.extractFromUrl(URL);

    // then
    const [, content] = ai.extract.mock.calls[0] as [
      unknown,
      Array<{ type: string; text?: string; url?: string }>,
    ];
    // 라벨은 짝이 되는 이미지 "바로 앞"에 와야 인덱스가 어긋나지 않는다.
    const labelled = content.flatMap((part, index) =>
      part.type === "image" ? [[content[index - 1]?.text, part.url]] : [],
    );
    expect(labelled).toEqual([
      ["[image 0]", "gs://bucket/abc123/0"],
      ["[image 1]", "gs://bucket/abc123/1"],
    ]);
  });

  it("저장된 이미지의 publicUrl 목록을 결과에 함께 반환한다", async () => {
    // given
    const { service, instagram, ai, geocoder, placeImage } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    placeImage.storePostImages.mockResolvedValue([
      {
        gsUri: "gs://bucket/instagram/abc123/000",
        publicUrl: "https://storage.googleapis.com/bucket/instagram/abc123/000",
        mediaType: "image/jpeg",
      },
      {
        gsUri: "gs://bucket/instagram/abc123/001",
        publicUrl: "https://storage.googleapis.com/bucket/instagram/abc123/001",
        mediaType: "image/png",
      },
    ]);
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockResolvedValue([makeCandidate()]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result.images).toEqual([
      "https://storage.googleapis.com/bucket/instagram/abc123/000",
      "https://storage.googleapis.com/bucket/instagram/abc123/001",
    ]);
  });

  it("장소를 못 뽑아도 이미 올린 이미지는 함께 반환한다", async () => {
    // given
    const { service, instagram, ai, geocoder, placeImage } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    placeImage.storePostImages.mockResolvedValue([
      {
        gsUri: "gs://bucket/instagram/abc123/000",
        publicUrl: "https://storage.googleapis.com/bucket/instagram/abc123/000",
        mediaType: "image/jpeg",
      },
    ]);
    ai.extract.mockResolvedValue({ places: [] });

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result.matches).toEqual([]);
    expect(result.images).toEqual([
      "https://storage.googleapis.com/bucket/instagram/abc123/000",
    ]);
    expect(geocoder.searchAll).not.toHaveBeenCalled();
  });

  it("지오코딩 결과가 없으면 해당 장소를 빈 후보로 반환한다(에러 아님)", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockResolvedValue([]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].extracted).toEqual({
      placeName: "어니언 성수",
      areaName: "성수동",
      areaType: "landmark",
      relation: "카페 방문 후기",
    });
    expect(result.matches[0].matches[0]).toBeUndefined();
    expect(result.matches[0].matches).toHaveLength(0);
  });

  it("추출된 장소가 없으면 빈 배열을 반환하고 지오코딩을 호출하지 않는다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [] });

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result.matches).toEqual([]);
    expect(geocoder.searchAll).not.toHaveBeenCalled();
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
    geocoder.searchAll.mockResolvedValue([
      makeCandidate({
        placeName: "정보 적은 곳",
        coordinate: { lat: 37.1, lng: 127.1 },
      }),
      makeCandidate({
        placeName: "정보 많은 곳",
        coordinate: { lat: 37.2, lng: 127.2 },
        mapUrl: "https://x",
        phone: "02-000",
        category: "카페",
      }),
    ]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result.matches[0].matches[0]?.placeName).toBe("정보 많은 곳");
    expect(result.matches[0].matches[0].placeName).toBe("정보 많은 곳");
  });

  it("정보 완전도가 같으면 더 가까운 후보를 먼저 정렬한다", async () => {
    // given
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({ places: [QUERY] });
    geocoder.searchAll.mockResolvedValue([
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
    expect(result.matches[0].matches[0]?.placeName).toBe("가까운 후보");
  });

  it("지명성 후보는 완전도가 높아도 랭킹에서 제외한다", async () => {
    /*
     * given — 필터 동작 검증용 가상 입력. 실제 카카오 응답에서 이 후보 조합이
     * 함께 반환됐는지와 당시 AI 추출값은 확인되지 않았다. 장소명은 운영 DB에
     * 저장된 실제 사례에서 가져온 추정 입력이다.
     */
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({
      places: [{ ...QUERY, place_name: "구천구백닭강정 역곡점" }],
    });
    geocoder.searchAll.mockResolvedValue([
      makeCandidate({
        // 전화번호·URL·거리를 다 가진 정보가 풍부한 역 후보 — 기존 랭킹으론 1위
        placeName: "역곡북부역사거리",
        category: "교통,수송 > 도로시설 > 교차로",
        mapUrl: "https://map.example/intersection",
        phone: "032-000-0000",
        distance: 100,
      }),
      makeCandidate({
        placeName: "구천구백닭강정 역곡점",
        category: "음식점 > 간식 > 닭강정",
        distance: 200,
      }),
    ]);

    // when
    const result = await service.extractFromUrl(URL);

    // then
    expect(result.matches[0].matches[0]?.placeName).toBe(
      "구천구백닭강정 역곡점",
    );
    expect(
      result.matches[0].matches.some((c) => c.placeName === "역곡북부역사거리"),
    ).toBe(false);
  });

  it("후보가 지명성뿐이면 해당 장소는 빈 후보로 반환한다", async () => {
    /*
     * given — 가상 입력: 지명 추출값(대흥역, 당시 AI 출력이 확인된 게 아닌
     * 추정 입력)에 교통 후보만 돌아온 조합.
     */
    const { service, instagram, ai, geocoder } = createService();
    instagram.fetchPost.mockResolvedValue(makePost());
    ai.extract.mockResolvedValue({
      places: [{ ...QUERY, place_name: "대흥역" }],
    });
    geocoder.searchAll.mockResolvedValue([
      makeCandidate({
        placeName: "대흥역 6호선",
        category: "교통,수송 > 지하철,전철 > 수도권6호선",
      }),
    ]);

    // when
    const result = await service.extractFromUrl(URL);

    // then — geocoding은 성공하지만 필터 후 남는 후보가 빈 배열이다.
    // 후보가 있을 때만 저장되는 것은 별도 저장 계층의 책임이라 여기서는 검증하지 않는다.
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].matches).toHaveLength(0);
    expect(result.matches[0].geocoding.status).toBe("fulfilled");
  });

  it("PlaceModule이 PlaceService를 해석한다", async () => {
    // given
    /*
     * DatabaseService·TasksService가 생성자에서 읽는 최소 env만 주입한다.
     * postgres-js 클라이언트는 lazy connect라 실제 DB 연결은 일어나지 않는다.
     */
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              DATABASE_URL: "postgres://postgres:postgres@localhost:5432/test",
              GOOGLE_CLOUD_PROJECT: "test-project",
              CLOUD_TASKS_LOCATION: "asia-northeast3",
              CLOUD_TASKS_QUEUE: "test-queue",
              CLOUD_TASKS_INVOKER_EMAIL: "invoker@test.iam.gserviceaccount.com",
              CLOUD_TASKS_MAX_ATTEMPTS: 10,
              APP_BASE_URL: "http://localhost:3000",
            }),
          ],
        }),
        PlaceModule,
      ],
    }).compile();

    // when
    const service = module.get(PlaceService);

    // then
    expect(service).toBeInstanceOf(PlaceService);
  });
});
