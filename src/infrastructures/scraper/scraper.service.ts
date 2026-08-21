import { Injectable } from "@nestjs/common";
import { InstagramEmbedProvider } from "./providers/instagram-embed.provider";
import type { ScrapedPost } from "./scraper.type";

@Injectable()
export class ScraperService {
  constructor(private readonly instagramProvider: InstagramEmbedProvider) {}

  fetchPost(url: string): Promise<ScrapedPost> {
    return this.instagramProvider.fetchPost(url);
  }
}
