import { Injectable } from "@nestjs/common";
import { isNull, sql } from "drizzle-orm";
import { DatabaseService } from "../../infrastructures/db/database.service";
import { places } from "./place.schema";
import type { PlaceMatch } from "./place.type";

/** 장소 추출의 최종 결과만 canonical places 테이블에 반영한다. 작업 상태는 저장하지 않는다. */
@Injectable()
export class PlaceResultRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async save(matches: PlaceMatch[]): Promise<void> {
    for (const candidate of matches.flatMap((match) => match.matches)) {
      await this.databaseService.db
        .insert(places)
        .values({
          provider: candidate.provider,
          providerPlaceId: candidate.providerPlaceId,
          name: candidate.placeName,
          address: candidate.address,
          lat: candidate.coordinate.lat,
          lng: candidate.coordinate.lng,
          phone: candidate.phone,
          category: candidate.category,
          externalUrl: candidate.mapUrl,
        })
        .onConflictDoUpdate({
          target: [places.provider, places.providerPlaceId],
          targetWhere: isNull(places.deletedAt),
          set: {
            name: sql`excluded.name`,
            address: sql`excluded.address`,
            lat: sql`excluded.lat`,
            lng: sql`excluded.lng`,
            phone: sql`excluded.phone`,
            category: sql`excluded.category`,
            externalUrl: sql`excluded.external_url`,
            updatedAt: sql`now()`,
          },
        });
    }
  }
}
