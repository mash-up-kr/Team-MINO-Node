import "reflect-metadata";
import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { AppException } from "../../common/exceptions/app.exception";
import { GeocoderModule } from "./geocoder.module";
import { GeocoderService } from "./geocoder.service";
import type { GeoCandidate, GeocoderProvider, GeoQuery } from "./geocoder.type";
import { KakaoProvider } from "./providers/kakao.provider";

const query: GeoQuery = {
  areaName: "서울",
  areaType: "landmark",
  placeName: "남산타워",
};

describe("Geocoder", () => {
  let service: GeocoderService;
  let kakao: KakaoProvider;

  function makeCandidate(overrides: Partial<GeoCandidate> = {}): GeoCandidate {
    return {
      provider: "kakao",
      providerPlaceId: "kakao-1",
      placeName: "남산서울타워",
      address: "서울 용산구 남산공원길 105",
      coordinate: { lat: 37.5512, lng: 126.9882 },
      ...overrides,
    };
  }

  function makeProvider(
    overrides: Partial<GeocoderProvider> = {},
  ): GeocoderProvider {
    return {
      name: "kakao",
      search: jest.fn().mockResolvedValue([makeCandidate()]),
      ...overrides,
    };
  }

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        GeocoderModule,
      ],
    }).compile();
    service = module.get(GeocoderService);
    kakao = module.get(KakaoProvider);
  });

  it("DI 컨테이너에서 GeocoderService를 해석한다", () => {
    expect(service).toBeInstanceOf(GeocoderService);
  });

  it("KakaoProvider는 DI 컨테이너에서 해석된다", () => {
    expect(kakao.name).toBe("kakao");
  });

  it("searchAll은 provider 결과를 병합한다", async () => {
    const kakaoProvider = makeProvider({
      name: "kakao",
      search: jest
        .fn()
        .mockResolvedValue([
          makeCandidate({ provider: "kakao", providerPlaceId: "kakao-1" }),
        ]),
    });
    const googleProvider = makeProvider({
      name: "google",
      search: jest.fn().mockResolvedValue([
        makeCandidate({
          provider: "google",
          providerPlaceId: "google-1",
          placeName: "N Seoul Tower",
        }),
      ]),
    });
    const geocoder = new GeocoderService([kakaoProvider, googleProvider]);

    const result = await geocoder.searchAll(query);

    expect(kakaoProvider.search).toHaveBeenCalledWith(query);
    expect(googleProvider.search).toHaveBeenCalledWith(query);
    expect(result).toHaveLength(2);
    expect(result.map((candidate) => candidate.provider)).toEqual([
      "kakao",
      "google",
    ]);
  });

  it("일부 provider가 실패해도 성공한 결과를 반환한다", async () => {
    const successfulProvider = makeProvider({
      search: jest.fn().mockResolvedValue([makeCandidate()]),
    });
    const failedProvider = makeProvider({
      name: "google",
      search: jest.fn().mockRejectedValue(new Error("provider down")),
    });
    const geocoder = new GeocoderService([successfulProvider, failedProvider]);

    const result = await geocoder.searchAll(query);

    expect(result).toEqual([makeCandidate()]);
  });

  it("모든 provider가 실패하면 GEOCODER_ALL_PROVIDERS_FAILED(502)를 던진다", async () => {
    const failedProvider = makeProvider({
      search: jest.fn().mockRejectedValue(new Error("provider down")),
    });
    const geocoder = new GeocoderService([failedProvider]);

    const error = await geocoder.searchAll(query).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ errorCode: "GEOCODER_ALL_PROVIDERS_FAILED" });
  });
});
