import "reflect-metadata";
import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { GeocoderModule } from "./geocoder.module";
import { GeocoderService } from "./geocoder.service";
import type { GeoCandidate, GeocoderProvider, GeoQuery } from "./geocoder.type";
import { KakaoProvider } from "./providers/kakao.provider";

const domesticQuery: GeoQuery = {
  areaName: "서울",
  areaType: "landmark",
  placeName: "남산타워",
  countryCode: "KR",
};
const overseasQuery: GeoQuery = {
  ...domesticQuery,
  areaName: "Paris",
  placeName: "Eiffel Tower",
  countryCode: "FR",
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
      supports: () => true,
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

  it("질의를 지원하는 provider로 검색한다", async () => {
    const provider = makeProvider();
    const geocoder = new GeocoderService([provider]);

    const result = await geocoder.search(domesticQuery);

    expect(provider.search).toHaveBeenCalledWith(domesticQuery);
    expect(result).toEqual([makeCandidate()]);
  });

  it("여러 provider가 지원하면 주입 순서가 앞선 하나만 호출한다", async () => {
    // 국가마다 정확한 provider가 정해져 있어 병합할 이유가 없고, 유료 provider 헛호출을 막는다.
    const first = makeProvider({ name: "kakao" });
    const second = makeProvider({ name: "google" });
    const geocoder = new GeocoderService([first, second]);

    await geocoder.search(domesticQuery);

    expect(first.search).toHaveBeenCalledTimes(1);
    expect(second.search).not.toHaveBeenCalled();
  });

  it("앞선 provider가 지원하지 않으면 다음 provider로 넘어간다", async () => {
    const domesticOnly = makeProvider({
      name: "kakao",
      supports: (query) => query.countryCode === "KR",
    });
    const worldwide = makeProvider({ name: "google" });
    const geocoder = new GeocoderService([domesticOnly, worldwide]);

    await geocoder.search(overseasQuery);

    expect(domesticOnly.search).not.toHaveBeenCalled();
    expect(worldwide.search).toHaveBeenCalledWith(overseasQuery);
  });

  it("지원하는 provider가 없으면 에러가 아니라 빈 결과를 반환한다", async () => {
    const domesticOnly = makeProvider({
      supports: (query) => query.countryCode === "KR",
    });
    const geocoder = new GeocoderService([domesticOnly]);

    const result = await geocoder.search(overseasQuery);

    expect(result).toEqual([]);
    expect(domesticOnly.search).not.toHaveBeenCalled();
  });

  it("provider 검색 실패는 감추지 않고 그대로 전파한다", async () => {
    const failing = makeProvider({
      search: jest.fn().mockRejectedValue(new Error("provider down")),
    });
    const geocoder = new GeocoderService([failing]);

    await expect(geocoder.search(domesticQuery)).rejects.toThrow(
      "provider down",
    );
  });
});
