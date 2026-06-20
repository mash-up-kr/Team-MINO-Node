import "reflect-metadata";
import { beforeEach, describe, expect, it } from "bun:test";
import { Test } from "@nestjs/testing";
import { ScraperModule } from "./scraper.module";
import { ScraperService } from "./scraper.service";

describe("ScraperService", () => {
  let service: ScraperService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ScraperModule],
    }).compile();
    service = module.get(ScraperService);
  });

  it("DI 컨테이너에서 ScraperService를 해석한다", () => {
    expect(service).toBeInstanceOf(ScraperService);
  });

  it("fetchPost는 아직 구현되지 않아 에러를 던진다", async () => {
    // when
    const call = service.fetchPost("https://www.instagram.com/p/abc123/");

    // then
    await expect(call).rejects.toThrow("Not implemented");
  });
});
