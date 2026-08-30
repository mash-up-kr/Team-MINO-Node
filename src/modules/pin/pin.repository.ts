import { Injectable } from "@nestjs/common";
import { and, desc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import { places } from "../place/place.schema";
import { rooms } from "../room/room.schema";
import { roomMembers } from "../room/room-member.schema";
import { sources } from "../source/source.schema";
import { users } from "../user/user.schema";
import { pins } from "./pin.schema";
import type { PinForUserRow, PinJoinRow, TargetRoomRow } from "./pin.type";
import { pinAccesses } from "./pin-access.schema";

/**
 * 핀 응답에 노출하는 컬럼 집합. drizzle은 entity 클래스 없이 테이블
 * 정의가 곧 스키마라, 내부 컬럼이 응답에 새지 않도록 select 대상을 상수로 고정한다.
 */
const PIN_COLUMNS = {
  id: pins.id,
  roomId: pins.roomId,
  createdAt: pins.createdAt,
};

/** 핀을 저장한 멤버("누가 추가한 곳") 표시용 프로필 컬럼 집합. */
const PIN_AUTHOR_COLUMNS = {
  userId: users.id,
  nickname: users.nickname,
  avatar: users.avatar,
};

@Injectable()
export class PinRepository extends BaseRepository {
  /**
   * 방의 핀 목록(장소·저장자 조인). 정렬은 기획 TBD(5종 필터) 확정 전까지
   * 최신순(createdAt DESC) 잠정. limit 미지정 시 전체를 반환한다.
   */
  async listByRoom(
    roomId: string,
    range?: { limit: number; offset: number },
  ): Promise<PinJoinRow[]> {
    const query = this.db
      .select({
        ...PIN_COLUMNS,
        place: places,
        author: PIN_AUTHOR_COLUMNS,
      })
      .from(pins)
      .innerJoin(
        places,
        and(eq(pins.placeId, places.id), isNull(places.deletedAt)),
      )
      .leftJoin(users, eq(pins.createdBy, users.id))
      .where(and(eq(pins.roomId, roomId), isNull(pins.deletedAt)))
      .orderBy(desc(pins.createdAt), desc(pins.id));

    if (!range) {
      return await query;
    }
    return await query.limit(range.limit).offset(range.offset);
  }

  /** 핀 상세(장소·저장자·출처 조인) + 요청 유저 멤버십을 한 쿼리로 조회한다. */
  async findDetailForUser(
    pinId: string,
    userId: string,
  ): Promise<
    (PinJoinRow & { sourceUrl: string | null; isMember: boolean }) | undefined
  > {
    const [row] = await this.db
      .select({
        ...PIN_COLUMNS,
        place: places,
        author: PIN_AUTHOR_COLUMNS,
        sourceUrl: sources.originalUrl,
        isMember: sql<boolean>`${exists(this.memberOfPinRoomSubquery(userId))}`,
      })
      .from(pins)
      .innerJoin(
        places,
        and(eq(pins.placeId, places.id), isNull(places.deletedAt)),
      )
      .leftJoin(users, eq(pins.createdBy, users.id))
      .leftJoin(
        sources,
        and(eq(pins.sourceId, sources.id), isNull(sources.deletedAt)),
      )
      .where(and(eq(pins.id, pinId), isNull(pins.deletedAt)))
      .limit(1);
    return row;
  }

  /**
   * 요청 유저가 활성 방(deleted 제외)의 활성 멤버인지 — 본 쿼리에 흡수하는 exists 서브쿼리.
   * raw sql 템플릿은 컬럼을 비정규화로 렌더링해 상관 참조가 깨지므로 쿼리 빌더로 만든다.
   */
  private memberOfPinRoomSubquery(userId: string) {
    return this.db
      .select({ one: sql`1` })
      .from(roomMembers)
      .innerJoin(
        rooms,
        and(eq(roomMembers.roomId, rooms.id), isNull(rooms.deletedAt)),
      )
      .where(
        and(
          eq(roomMembers.roomId, pins.roomId),
          eq(roomMembers.userId, userId),
          isNull(roomMembers.deletedAt),
        ),
      );
  }

  /** 핀 + 소속 방 멤버십을 한 쿼리로 조회한다 (복제·접근 기록용). */
  async findActiveByIdForUser(
    pinId: string,
    userId: string,
  ): Promise<PinForUserRow | undefined> {
    const [pin] = await this.db
      .select({
        id: pins.id,
        roomId: pins.roomId,
        placeId: pins.placeId,
        sourceId: pins.sourceId,
        isMember: sql<boolean>`${exists(this.memberOfPinRoomSubquery(userId))}`,
      })
      .from(pins)
      .where(and(eq(pins.id, pinId), isNull(pins.deletedAt)))
      .limit(1);
    return pin;
  }

  /** 복제 대상 방들의 활성 여부 + 요청 유저 멤버십을 한 쿼리로 판정한다. */
  async listTargetRoomsWithMembership(
    roomIds: string[],
    userId: string,
  ): Promise<TargetRoomRow[]> {
    return await this.db
      .select({
        roomId: rooms.id,
        isMember: sql<boolean>`${exists(
          this.db
            .select({ one: sql`1` })
            .from(roomMembers)
            .where(
              and(
                eq(roomMembers.roomId, rooms.id),
                eq(roomMembers.userId, userId),
                isNull(roomMembers.deletedAt),
              ),
            ),
        )}`,
      })
      .from(rooms)
      .where(and(inArray(rooms.id, roomIds), isNull(rooms.deletedAt)));
  }

  /** 대상 방들 중 지정 장소가 이미 저장된 방이 있는지. */
  async existsPlaceInRooms(
    roomIds: string[],
    placeId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ roomId: pins.roomId })
      .from(pins)
      .where(
        and(
          inArray(pins.roomId, roomIds),
          eq(pins.placeId, placeId),
          isNull(pins.deletedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async insertMany(
    values: Array<{
      roomId: string;
      placeId: string;
      sourceId: string | null;
      createdBy: string;
    }>,
  ): Promise<void> {
    await this.db.insert(pins).values(values);
  }

  /** 접근 로그 추가(append-only). */
  async insertAccess(pinId: string, userId: string): Promise<void> {
    await this.db.insert(pinAccesses).values({ pinId, userId });
  }
}
