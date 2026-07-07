import { Injectable } from "@nestjs/common";
import { extractInstagramShortcode } from "./instagram-url";
import { InstagramProvider } from "./providers/instagram.provider";
import type { ScrapedPost } from "./scraper.type";

@Injectable()
export class ScraperService {
  constructor(private readonly instagramProvider: InstagramProvider) {}

  fetchPost(url: string): Promise<ScrapedPost> {
    return this.instagramProvider.fetchPost(url);
  }

  /**
   * 네트워크 호출 없이 게시글 URL을 검증하고 shortcode를 반환한다. job 생성 시 dedup 키를
   * 얻으면서 fetch와 동일한 URL 식별 규칙을 재사용하기 위한 경계 메서드.
   */
  extractShortcode(url: string): string {
    return extractInstagramShortcode(url);
  }
}
