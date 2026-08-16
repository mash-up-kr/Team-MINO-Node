import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import { sources } from "./source.schema";

@Injectable()
export class SourceRepository extends BaseRepository {
  async ensureActiveInstagramSource(originalUrl: string): Promise<string> {
    const [existing] = await this.db
      .select({ id: sources.id })
      .from(sources)
      .where(
        and(
          eq(sources.type, "instagram"),
          eq(sources.originalUrl, originalUrl),
          isNull(sources.deletedAt),
        ),
      )
      .limit(1);
    if (existing) return existing.id;

    await this.db
      .insert(sources)
      .values({ type: "instagram", originalUrl })
      .onConflictDoNothing({
        target: sources.originalUrl,
        where: isNull(sources.deletedAt),
      });

    const [source] = await this.db
      .select({ id: sources.id })
      .from(sources)
      .where(
        and(
          eq(sources.type, "instagram"),
          eq(sources.originalUrl, originalUrl),
          isNull(sources.deletedAt),
        ),
      )
      .limit(1);
    if (!source) {
      throw new Error("Active Instagram source was not created");
    }
    return source.id;
  }
}
