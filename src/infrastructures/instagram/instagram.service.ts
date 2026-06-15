import { Injectable } from "@nestjs/common";
import type { ScrapedPost } from "./instagram.type";

@Injectable()
export class InstagramService {
  async fetchPost(_url: string): Promise<ScrapedPost> {
    throw new Error("Not implemented");
  }
}
