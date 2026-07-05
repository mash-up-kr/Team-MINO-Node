import "reflect-metadata";
import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { InstagramProvider } from "./providers/instagram.provider";
import { ScraperModule } from "./scraper.module";
import { ScraperService } from "./scraper.service";
import type { ScrapedPost } from "./scraper.type";

describe("ScraperService", () => {
  let service: ScraperService;
  let instagram: InstagramProvider;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ScraperModule,
      ],
    }).compile();
    service = module.get(ScraperService);
    instagram = module.get(InstagramProvider);
  });

  it("DI 컨테이너에서 ScraperService를 해석한다", () => {
    expect(service).toBeInstanceOf(ScraperService);
  });

  it("fetchPost는 InstagramProvider로 위임한다", async () => {
    // given
    const url = "https://www.instagram.com/p/abc123/";
    const post = {} as ScrapedPost;
    const spy = spyOn(instagram, "fetchPost").mockResolvedValue(post);

    // when
    const result = await service.fetchPost(url);

    // then
    expect(spy).toHaveBeenCalledWith(url);
    expect(result).toBe(post);
  });
});
