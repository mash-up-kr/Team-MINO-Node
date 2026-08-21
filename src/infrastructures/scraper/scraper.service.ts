import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { extractInstagramShortcode } from "./instagram.util";
import type { InstagramProvider, ScrapedPost } from "./scraper.type";

export const INSTAGRAM_PROVIDERS = Symbol("INSTAGRAM_PROVIDERS");

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(
    @Inject(INSTAGRAM_PROVIDERS)
    private readonly providers: readonly InstagramProvider[],
  ) {}

  /**
   * 우선순위대로 경로를 하나씩 시도해 처음 성공한 결과를 쓴다.
   *
   * `null`은 "이 경로로는 못 얻음"이라 다음으로 넘기고, 게시글 부재가 확실한 경우
   * provider가 던지는 AppException은 그대로 전파해 체인을 끝낸다.
   */
  async fetchPost(url: string): Promise<ScrapedPost> {
    const shortcode = extractInstagramShortcode(url);

    for (const [index, provider] of this.providers.entries()) {
      const post = await provider.fetch(shortcode);
      if (!post) continue;

      // 1순위가 아닌 경로로 성공했다는 건 앞 경로가 깨졌다는 신호 — 추적 대상이다.
      if (index > 0) {
        this.logger.warn(
          { shortcode, provider: provider.name, index },
          "폴백 경로로 게시글을 가져왔습니다.",
        );
      }
      return post;
    }

    throw new AppException(
      "SCRAPER_REQUEST_FAILED",
      "인스타그램 게시글을 가져올 수 없습니다.",
      HttpStatus.BAD_GATEWAY,
    );
  }
}
