import { HttpStatus, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { AppException } from "../../common/exceptions/app.exception";
import type { PinExtractionTask } from "../../common/tasks/pin-extraction-task.dto";
import { DatabaseService } from "../../infrastructures/db/database.service";
import { pins } from "../pin/pin.schema";
import { rooms } from "../room/room.schema";
import { roomMembers } from "../room/room-member.schema";
import { placeSources } from "../source/place-source.schema";
import { sources } from "../source/source.schema";
import { users } from "../user/user.schema";
import { places } from "./place.schema";
import type { DuplicatedPlace, PlaceCandidate, PlaceMatch } from "./place.type";
import { classifyPlaceCategory } from "./place.util";

type TransactionClient = Parameters<
  Parameters<DatabaseService["db"]["transaction"]>[0]
>[0];

export type PlaceSaveResult = {
  readonly retryableFailures: number;
  readonly persistedPlaces: number;
  readonly duplicatedPlaces: DuplicatedPlace[];
};

/** 추출 성공분만 한 트랜잭션으로 반영하고, 실패 장소는 워커 재시도 판단에 전달한다. */
@Injectable()
export class PlaceResultRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * 작업이 여전히 유효한 대상에게 향하는지 확인.
   *
   * TOCTOU 방어: enqueue 시점과 저장 시점 사이(수 분)에 사용자가 방을 나갔을 수 있음.
   * source/user 존재 여부를 확인하고, createdBy가 여전히 각 roomId의 활성 멤버인지도
   * 함께 검증해서 더 이상 멤버가 아닌 사용자의 핀이 저장되는 것을 차단.
   */
  async activeRoomIdsForTask(task: PinExtractionTask): Promise<string[]> {
    const [source, user] = await Promise.all([
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
    ]);
    if (source.length === 0 || user.length === 0) return [];

    const activeRooms = await this.databaseService.db
      .select({ roomId: rooms.id })
      .from(rooms)
      .innerJoin(
        roomMembers,
        and(
          eq(roomMembers.roomId, rooms.id),
          eq(roomMembers.userId, task.createdBy),
          isNull(roomMembers.deletedAt),
        ),
      )
      .where(and(inArray(rooms.id, task.roomIds), isNull(rooms.deletedAt)));
    return activeRooms.map((room) => room.roomId);
  }

  async save(
    task: PinExtractionTask,
    matches: PlaceMatch[],
  ): Promise<PlaceSaveResult> {
    // retryable을 명시한 AppException은 그 값을 그대로 따르고, 명시하지 않았으면
    // 5xx만 재시도 가능으로 본다(AppException 기본 규칙과 동일). geocoder가 모든
    // 실패를 502로 뭉뚱그려도 retryable: false를 명시한 영구 실패(파싱 오류 등)는
    // 여기서 재시도 대상으로 잘못 집계되지 않는다.
    const retryableFailures = matches.filter((match) => {
      if (match.geocoding.status !== "rejected") return false;
      const reason = match.geocoding.reason;
      return (
        reason instanceof AppException &&
        (reason.retryable ?? reason.getStatus() >= 500)
      );
    }).length;
    // 핀에 넣을 이미지는 장소별로 다르므로 후보와 짝지어 들고 간다.
    const successfulMatches = matches.flatMap((match) => {
      if (match.geocoding.status !== "fulfilled") return [];
      const candidate = match.matches[0];
      return candidate ? [{ candidate, images: match.images }] : [];
    });
    // 한 게시물에서 뽑은 서로 다른 추출 결과가 같은 실제 장소로 지오코딩되면
    // provider+providerPlaceId가 겹친다. 그대로 배치 upsert에 넘기면 한 INSERT문
    // 안에서 같은 충돌 대상을 두 번 건드리게 되어 Postgres가 통째로 던진다
    // ("ON CONFLICT DO UPDATE command cannot affect row a second time") — 먼저
    // provider+providerPlaceId 기준으로 중복을 제거한다(처음 것을 채택).
    // 같은 장소로 모인 추출 결과의 이미지는 합친다(순서 유지, 중복 제거) — 한쪽만
    // 남기면 그 장소의 사진 일부가 사라진다.
    const byPlaceKey = new Map<
      string,
      { candidate: PlaceCandidate; images: string[] }
    >();
    for (const { candidate, images: placeImages } of successfulMatches) {
      const key = `${candidate.provider}:${candidate.providerPlaceId}`;
      const existing = byPlaceKey.get(key);
      if (!existing) {
        byPlaceKey.set(key, { candidate, images: placeImages });
        continue;
      }
      existing.images = [...new Set([...existing.images, ...placeImages])];
    }
    const uniquePlaces = Array.from(byPlaceKey.values());

    if (uniquePlaces.length === 0) {
      return { retryableFailures, persistedPlaces: 0, duplicatedPlaces: [] };
    }

    let duplicatedPlaces: DuplicatedPlace[] = [];
    await this.databaseService.db.transaction(async (tx) => {
      // Batch insert places (N+1 방지)
      const insertedPlaces = await tx
        .insert(places)
        .values(
          uniquePlaces.map(({ candidate }) => ({
            provider: candidate.provider,
            providerPlaceId: candidate.providerPlaceId,
            name: candidate.placeName,
            address: candidate.address,
            lat: candidate.coordinate.lat,
            lng: candidate.coordinate.lng,
            phone: candidate.phone,
            category: candidate.category,
            categoryGroup: classifyPlaceCategory(candidate.category),
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
            categoryGroup: sql`excluded.category_group`,
            externalUrl: sql`excluded.external_url`,
            updatedAt: sql`now()`,
          },
        })
        .returning({
          id: places.id,
          provider: places.provider,
          providerPlaceId: places.providerPlaceId,
        });

      // upsert 반환 순서에 기대지 않고 provider 키로 이미지를 맞춘다.
      const imagesByPlaceKey = new Map(
        uniquePlaces.map(({ candidate, images: placeImages }) => [
          `${candidate.provider}:${candidate.providerPlaceId}`,
          placeImages,
        ]),
      );

      if (insertedPlaces.length !== uniquePlaces.length) {
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

      // 핀을 넣기 전에 읽어야 한다. insert 후엔 재배달분과 구분되지 않는다.
      duplicatedPlaces = await this.findDuplicated(tx, task, insertedPlaces);

      // Batch insert pins
      await tx
        .insert(pins)
        .values(
          task.roomIds.flatMap((roomId) =>
            insertedPlaces.map((place) => {
              const placeImages = imagesByPlaceKey.get(
                `${place.provider}:${place.providerPlaceId}`,
              );
              return {
                roomId,
                placeId: place.id,
                sourceId: task.sourceId,
                createdBy: task.createdBy,
                // 게시물 이미지는 핀(게시물×방)의 것이다. 같은 장소를 다른 글로
                // 저장한 사람의 사진이 이 핀의 썸네일을 덮지 않는다.
                images: placeImages?.length ? placeImages : null,
              };
            }),
          ),
        )
        .onConflictDoNothing({
          target: [pins.roomId, pins.placeId],
          where: isNull(pins.deletedAt),
        });
    });

    return {
      retryableFailures,
      persistedPlaces: uniquePlaces.length,
      duplicatedPlaces,
    };
  }

  private async findDuplicated(
    tx: TransactionClient,
    task: PinExtractionTask,
    insertedPlaces: { id: string }[],
  ): Promise<DuplicatedPlace[]> {
    if (!task.enqueuedAt) return [];

    // 방 여러 곳이 한꺼번에 중복이어도 장소당 한 건이다(FR-021). 같은 저장은
    // created_at이 같아 id까지 봐야 매번 같은 핀이 뽑힌다.
    return tx
      .selectDistinctOn([pins.placeId], {
        pinId: pins.id,
        placeId: pins.placeId,
        placeName: places.name,
        thumbnailUrl: sql<string | null>`${pins.images} ->> 0`,
      })
      .from(pins)
      .innerJoin(places, eq(pins.placeId, places.id))
      .where(
        and(
          inArray(pins.roomId, task.roomIds),
          inArray(
            pins.placeId,
            insertedPlaces.map((place) => place.id),
          ),
          isNull(pins.deletedAt),
          lt(pins.createdAt, new Date(task.enqueuedAt)),
        ),
      )
      .orderBy(pins.placeId, desc(pins.createdAt), desc(pins.id));
  }
}
