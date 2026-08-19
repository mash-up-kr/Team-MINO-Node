import { HttpStatus, Injectable } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { AppException } from "../../common/exceptions/app.exception";
import { DatabaseService } from "../../infrastructures/db/database.service";
import type { PinExtractionTask } from "../pin/pin.dto";
import { pins } from "../pin/pin.schema";
import { rooms } from "../room/room.schema";
import { roomMembers } from "../room/room-member.schema";
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

  /**
   * 작업이 여전히 유효한 대상에게 향하는지 확인.
   *
   * TOCTOU 방어: enqueue 시점과 저장 시점 사이(수 분)에 사용자가 방을 나갔을 수 있음.
   * 방/source/user 존재 여부는 기본 확인이고, createdBy가 여전히 roomId의 활성 멤버인지도
   * 함께 검증해서 더 이상 멤버가 아닌 사용자의 핀이 저장되는 것을 차단.
   */
  async isActiveTaskTarget(task: PinExtractionTask): Promise<boolean> {
    const [room, source, user, membership] = await Promise.all([
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
            isNull(sources.deletedAt),
          ),
        )
        .limit(1),
      this.databaseService.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, task.createdBy), isNull(users.deletedAt)))
        .limit(1),
      this.databaseService.db
        .select({ id: roomMembers.id })
        .from(roomMembers)
        .where(
          and(
            eq(roomMembers.roomId, task.roomId),
            eq(roomMembers.userId, task.createdBy),
            isNull(roomMembers.deletedAt),
          ),
        )
        .limit(1),
    ]);
    return (
      room.length > 0 &&
      source.length > 0 &&
      user.length > 0 &&
      membership.length > 0
    );
  }

  async save(
    task: PinExtractionTask,
    matches: PlaceMatch[],
  ): Promise<PlaceSaveResult> {
    // 재시도 가능 failure는 AppException이면서 retryable: true인 경우만.
    // 영구 실패(502, 파싱 오류 등)는 재시도해도 소용없으므로 acknowledge 처리.
    const retryableFailures = matches.filter((match) => {
      if (match.geocoding.status !== "rejected") return false;
      const reason = match.geocoding.reason;
      return reason instanceof AppException && reason.retryable === true;
    }).length;
    const successfulMatches = matches.flatMap((match) => {
      if (match.geocoding.status !== "fulfilled") return [];
      const candidate = match.matches[0];
      return candidate ? [candidate] : [];
    });

    if (successfulMatches.length === 0) {
      return { retryableFailures, persistedPlaces: 0 };
    }

    await this.databaseService.db.transaction(async (tx) => {
      // Batch insert places (N+1 방지)
      const insertedPlaces = await tx
        .insert(places)
        .values(
          successfulMatches.map((candidate) => ({
            provider: candidate.provider,
            providerPlaceId: candidate.providerPlaceId,
            name: candidate.placeName,
            address: candidate.address,
            lat: candidate.coordinate.lat,
            lng: candidate.coordinate.lng,
            phone: candidate.phone,
            category: candidate.category,
            externalUrl: candidate.mapUrl,
          })),
        )
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

      if (insertedPlaces.length !== successfulMatches.length) {
        throw new AppException(
          "PLACE_UPSERT_FAILED",
          "장소를 저장하지 못했습니다.",
          HttpStatus.BAD_GATEWAY,
        );
      }

      // Batch insert placeSources
      await tx
        .insert(placeSources)
        .values(
          insertedPlaces.map((place) => ({
            placeId: place.id,
            sourceId: task.sourceId,
          })),
        )
        .onConflictDoNothing({
          target: [placeSources.placeId, placeSources.sourceId],
          where: isNull(placeSources.deletedAt),
        });

      // Batch insert pins
      await tx
        .insert(pins)
        .values(
          insertedPlaces.map((place) => ({
            roomId: task.roomId,
            placeId: place.id,
            sourceId: task.sourceId,
            createdBy: task.createdBy,
          })),
        )
        .onConflictDoNothing({
          target: [pins.roomId, pins.placeId],
          where: isNull(pins.deletedAt),
        });
    });

    return {
      retryableFailures,
      persistedPlaces: successfulMatches.length,
    };
  }
}
