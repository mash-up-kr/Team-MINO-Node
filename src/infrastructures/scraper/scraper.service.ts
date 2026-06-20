import { Injectable } from "@nestjs/common";
import { InstagramProvider } from "./providers/instagram.provider";
import type { ScrapedPost } from "./scraper.type";

@Injectable()
export class ScraperService {
  constructor(private readonly instagramProvider: InstagramProvider) {}

  fetchPost(url: string): Promise<ScrapedPost> {
    return this.instagramProvider.fetchPost(url);
  }
}
