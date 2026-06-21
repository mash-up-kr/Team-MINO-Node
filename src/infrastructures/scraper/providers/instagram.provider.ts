import { Injectable } from "@nestjs/common";
import type { ScrapedPost } from "../scraper.type";

@Injectable()
export class InstagramProvider {
  async fetchPost(_url: string): Promise<ScrapedPost> {
    throw new Error("Not implemented");
  }
}
