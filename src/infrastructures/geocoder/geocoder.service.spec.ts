import "reflect-metadata";
import { beforeEach, describe, expect, it } from "bun:test";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { GeocoderModule } from "./geocoder.module";
import { GeocoderService } from "./geocoder.service";
import type { GeoQuery } from "./geocoder.type";
import { GoogleProvider } from "./providers/google.provider";
import { KakaoProvider } from "./providers/kakao.provider";

const query: GeoQuery = { areaName: "서울", placeName: "남산타워" };

describe("Geocoder", () => {
  let service: GeocoderService;
  let kakao: KakaoProvider;
  let google: GoogleProvider;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        GeocoderModule,
      ],
    }).compile();
    service = module.get(GeocoderService);
    kakao = module.get(KakaoProvider);
    google = module.get(GoogleProvider);
  });

  it("DI 컨테이너에서 GeocoderService를 해석한다", () => {
    expect(service).toBeInstanceOf(GeocoderService);
  });

  it("searchAll은 아직 구현되지 않아 에러를 던진다", async () => {
    await expect(service.searchAll(query)).rejects.toThrow("Not implemented");
  });

  it("KakaoProvider는 name이 'kakao'이고 search는 에러를 던진다", async () => {
    expect(kakao.name).toBe("kakao");
    await expect(kakao.search(query)).rejects.toThrow("Not implemented");
  });

  it("GoogleProvider는 name이 'google'이고 search는 에러를 던진다", async () => {
    expect(google.name).toBe("google");
    await expect(google.search(query)).rejects.toThrow("Not implemented");
  });
});
