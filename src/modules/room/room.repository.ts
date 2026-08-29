import { Injectable } from "@nestjs/common";
import { and, desc, eq, exists, inArray, isNull, lte, sql } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import { pins } from "../pin/pin.schema";
import { places } from "../place/place.schema";
import { users } from "../user/user.schema";
import { rooms } from "./room.schema";
import type {
  CreateSharedRoomInput,
  MemberWithRoomRow,
  RoomForUserRow,
  RoomPinImageRow,
  RoomRow,
  RoomWithCountsRow,
  UpdateRoomInput,
} from "./room.type";
import { roomMembers } from "./room-member.schema";

/**
 * 방 응답에 노출하는 컬럼 집합. drizzle은 entity 클래스 없이 테이블
 * 정의가 곧 스키마라, 내부 컬럼(deleted_at 등)이 응답에 새지 않도록
 * select 대상 컬럼을 상수로 고정한다.
 */
const ROOM_COLUMNS = {
  id: rooms.id,
  type: rooms.type,
  name: rooms.name,
  description: rooms.description,
  color: rooms.color,
  ownerId: rooms.ownerId,
  createdAt: rooms.createdAt,
};

@Injectable()
export class RoomRepository extends BaseRepository {
  /** 방별 활성 핀 수 — 상관 서브쿼리로 목록/상세 조회에 함께 내린다. */
  private get pinCount() {
    return this.db.$count(
      pins,
      and(eq(pins.roomId, rooms.id), isNull(pins.deletedAt)),
    );
  }

  /** 방별 활성 멤버 수 — 상관 서브쿼리. */
  private get memberCount() {
    return this.db.$count(
      roomMembers,
      and(eq(roomMembers.roomId, rooms.id), isNull(roomMembers.deletedAt)),
    );
  }

  /** 공동방 + 생성자 멤버십을 한 트랜잭션으로 생성한다. */
  async createSharedRoom(
    ownerId: string,
    input: CreateSharedRoomInput,
  ): Promise<RoomRow> {
    return await this.db.transaction(async (tx) => {
      const [room] = await tx
        .insert(rooms)
        .values({
          ownerId,
          type: "shared",
          name: input.name,
          description: input.description,
          color: input.color,
        })
        .returning(ROOM_COLUMNS);
      if (!room) {
        throw new Error("방 생성에 실패했습니다.");
      }

      await tx.insert(roomMembers).values({ roomId: room.id, userId: ownerId });
      return room;
    });
  }

  async findActiveById(roomId: string): Promise<RoomRow | undefined> {
    const [room] = await this.db
      .select(ROOM_COLUMNS)
      .from(rooms)
      .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
      .limit(1);
    return room;
  }

  /**
   * 요청 유저의 활성 멤버십 존재 여부 — 본 쿼리에 흡수하는 exists 서브쿼리.
   * raw sql 템플릿은 컬럼을 비정규화로 렌더링해 상관 참조가 깨지므로 쿼리 빌더로 만든다.
   */
  private memberSubquery(userId: string) {
    return this.db
      .select({ one: sql`1` })
      .from(roomMembers)
      .where(
        and(
          eq(roomMembers.roomId, rooms.id),
          eq(roomMembers.userId, userId),
          isNull(roomMembers.deletedAt),
        ),
      );
  }

  private isMemberOf(userId: string) {
    return sql<boolean>`${exists(this.memberSubquery(userId))}`;
  }

  /** 방 상세/나가기 — 핀 수·멤버 수·요청 유저 멤버십까지 한 쿼리로 조회한다. */
  async findActiveByIdForUser(
    roomId: string,
    userId: string,
  ): Promise<RoomForUserRow | undefined> {
    const [room] = await this.db
      .select({
        ...ROOM_COLUMNS,
        pinCount: this.pinCount,
        memberCount: this.memberCount,
        isMember: this.isMemberOf(userId),
      })
      .from(rooms)
      .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
      .limit(1);
    return room;
  }

  /**
   * 유저가 속한 활성 방 목록 — 핀 수·멤버 수를 서브쿼리로 함께 조회한다.
   * 정렬은 기획 미확정이라 생성 역순 잠정.
   */
  async listJoinedRoomsWithCounts(
    userId: string,
  ): Promise<RoomWithCountsRow[]> {
    return await this.db
      .select({
        ...ROOM_COLUMNS,
        pinCount: this.pinCount,
        memberCount: this.memberCount,
      })
      .from(roomMembers)
      .innerJoin(
        rooms,
        and(eq(roomMembers.roomId, rooms.id), isNull(rooms.deletedAt)),
      )
      .where(and(eq(roomMembers.userId, userId), isNull(roomMembers.deletedAt)))
      .orderBy(desc(rooms.createdAt));
  }

  /**
   * 방별 최근 핀의 장소 대표 이미지(images[0]) — 방 목록 썸네일용.
   * 대표 이미지가 있는 핀만 방마다 최신순 최대 limitPerRoom개로 자른다.
   * window 함수 안의 raw sql 컬럼은 비정규화로 렌더링돼 조인(places)과
   * 모호해지므로, 정규화 식별자를 직접 쓴다.
   */
  async listRecentPinImages(
    roomIds: string[],
    limitPerRoom: number,
  ): Promise<RoomPinImageRow[]> {
    const ranked = this.db
      .select({
        roomId: pins.roomId,
        imageUrl: sql<string>`${places.images} ->> 0`.as("image_url"),
        rank: sql<number>`row_number() over (partition by "pins"."room_id" order by "pins"."created_at" desc, "pins"."id" desc)`.as(
          "rank",
        ),
      })
      .from(pins)
      .innerJoin(places, eq(pins.placeId, places.id))
      .where(
        and(
          inArray(pins.roomId, roomIds),
          isNull(pins.deletedAt),
          sql`${places.images} ->> 0 is not null`,
        ),
      )
      .as("ranked");

    return await this.db
      .select({ roomId: ranked.roomId, imageUrl: ranked.imageUrl })
      .from(ranked)
      .where(lte(ranked.rank, limitPerRoom))
      .orderBy(ranked.roomId, ranked.rank);
  }

  /** 지정 장소가 이미 저장된 방 id 목록 — "다른 방에 공유" 화면용. */
  async findRoomIdsHavingPlace(
    roomIds: string[],
    placeId: string,
  ): Promise<string[]> {
    const rows = await this.db
      .select({ roomId: pins.roomId })
      .from(pins)
      .where(
        and(
          inArray(pins.roomId, roomIds),
          eq(pins.placeId, placeId),
          isNull(pins.deletedAt),
        ),
      );
    return rows.map((row) => row.roomId);
  }

  /** 방 멤버 목록 — 방장 여부(isOwner)까지 SQL에서 판별해 응답 형태로 내린다. */
  async listMembersWithRole(roomIds: string[]): Promise<MemberWithRoomRow[]> {
    return await this.db
      .select({
        roomId: roomMembers.roomId,
        userId: roomMembers.userId,
        nickname: users.nickname,
        avatar: users.avatar,
        isOwner: sql<boolean>`${roomMembers.userId} = ${rooms.ownerId}`,
        joinedAt: roomMembers.joinedAt,
      })
      .from(roomMembers)
      .innerJoin(users, eq(roomMembers.userId, users.id))
      .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
      .where(
        and(
          inArray(roomMembers.roomId, roomIds),
          isNull(roomMembers.deletedAt),
        ),
      )
      .orderBy(roomMembers.joinedAt);
  }

  async updateActiveById(
    roomId: string,
    patch: UpdateRoomInput,
  ): Promise<RoomRow | undefined> {
    const [room] = await this.db
      .update(rooms)
      .set(patch)
      .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
      .returning(ROOM_COLUMNS);
    return room;
  }

  /** 방장 위임 — 대상이 활성 멤버일 때만 갱신하고 성공 여부를 돌려준다. */
  async transferOwnerToMember(
    roomId: string,
    nextOwnerId: string,
  ): Promise<boolean> {
    const updated = await this.db
      .update(rooms)
      .set({ ownerId: nextOwnerId })
      .where(
        and(
          eq(rooms.id, roomId),
          isNull(rooms.deletedAt),
          exists(this.memberSubquery(nextOwnerId)),
        ),
      )
      .returning({ id: rooms.id });
    return updated.length > 0;
  }

  async softDeleteMembership(
    roomId: string,
    userId: string,
    at: Date,
  ): Promise<void> {
    await this.db
      .update(roomMembers)
      .set({ deletedAt: at })
      .where(
        and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, userId),
          isNull(roomMembers.deletedAt),
        ),
      );
  }

  /** 마지막 멤버(방장) 나가기 — 멤버십과 방을 한 트랜잭션으로 soft delete. */
  async softDeleteMembershipAndRoom(
    roomId: string,
    userId: string,
    at: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(roomMembers)
        .set({ deletedAt: at })
        .where(
          and(
            eq(roomMembers.roomId, roomId),
            eq(roomMembers.userId, userId),
            isNull(roomMembers.deletedAt),
          ),
        );
      await tx
        .update(rooms)
        .set({ deletedAt: at })
        .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)));
    });
  }
}
