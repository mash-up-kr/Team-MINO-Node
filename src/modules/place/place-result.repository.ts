import { Injectable } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { DatabaseService } from "../../infrastructures/db/database.service";
import type { PinExtractionTask } from "../pin/pin.dto";
import { pins } from "../pin/pin.schema";
import { rooms } from "../room/room.schema";
import { placeSources } from "../source/place-source.schema";
import { sources } from "../source/source.schema";
import { users } from "../user/user.schema";
import { places } from "./place.schema";
import type { PlaceMatch } from "./place.type";

export type PlaceSaveResult = {
  readonly retryableFailures: number;
  readonly persistedPlaces: number;
};

/** 추출 성공분만 한 트랜잭션으로 반영하고, 실패 장소는 워커 재시도 판단에 전달한다. */
@Injectable()
export class PlaceResultRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async isActiveTaskTarget(task: PinExtractionTask): Promise<boolean> {
    const [room, source, user] = await Promise.all([
      this.databaseService.db
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(eq(rooms.id, task.roomId), isNull(rooms.deletedAt)))
        .limit(1),
      this.databaseService.db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(
            eq(sources.id, task.sourceId),
            eq(sources.type, "instagram"),
            eq(sources.originalUrl, task.url),
            isNull(sources.deletedAt),
          ),
        )
        .limit(1),
      this.databaseService.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, task.createdBy), isNull(users.deletedAt)))
        .limit(1),
    ]);
    return room.length > 0 && source.length > 0 && user.length > 0;
  }

  async save(
    task: PinExtractionTask,
    matches: PlaceMatch[],
  ): Promise<PlaceSaveResult> {
    const retryableFailures = matches.filter(
      (match) => match.geocoding.status === "rejected",
    ).length;
    const successfulMatches = matches.flatMap((match) => {
      if (match.geocoding.status !== "fulfilled") return [];
      const candidate = match.matches[0];
      return candidate ? [candidate] : [];
    });

    if (successfulMatches.length === 0) {
      return { retryableFailures, persistedPlaces: 0 };
    }

    await this.databaseService.db.transaction(async (tx) => {
      for (const candidate of successfulMatches) {
        const [place] = await tx
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
          })
          .returning({ id: places.id });
        if (!place) throw new Error("Place upsert did not return an id");

        await tx
          .insert(placeSources)
          .values({ placeId: place.id, sourceId: task.sourceId })
          .onConflictDoNothing({
            target: [placeSources.placeId, placeSources.sourceId],
            where: isNull(placeSources.deletedAt),
          });

        await tx
          .insert(pins)
          .values({
            roomId: task.roomId,
            placeId: place.id,
            sourceId: task.sourceId,
            createdBy: task.createdBy,
          })
          .onConflictDoNothing({
            target: [pins.roomId, pins.placeId],
            where: isNull(pins.deletedAt),
          });
      }
    });

    return {
      retryableFailures,
      persistedPlaces: successfulMatches.length,
    };
  }
}
