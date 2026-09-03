import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, exists, gte, isNull, sql } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import { pins } from "../pin/pin.schema";
import { activeCommentCount, stalenessOfPin } from "../pin/pin.sql";
import { pinAccesses } from "../pin/pin-access.schema";
import { places } from "../place/place.schema";
import { distanceToPlace } from "../place/place.sql";
import { rooms } from "../room/room.schema";
import { roomMembers } from "../room/room-member.schema";
import { users } from "../user/user.schema";
import {
  DECK_SIZE,
  LATEST_WINDOW_DAYS,
  METERS_PER_LAT_DEGREE,
  NEARBY_RADIUS_METERS,
} from "./card.constant";
import type { ListCardsQuery } from "./card.dto";
import type { CandidateRow, CardRoomRow } from "./card.type";

const CARD_PLACE_COLUMNS = {
  id: places.id,
  provider: places.provider,
  providerPlaceId: places.providerPlaceId,
  name: places.name,
  address: places.address,
  city: places.city,
  district: places.district,
  lat: places.lat,
  lng: places.lng,
  category: places.category,
  phone: places.phone,
  externalUrl: places.externalUrl,
  images: places.images,
};

const CARD_AUTHOR_COLUMNS = {
  userId: users.id,
  nickname: users.nickname,
  avatar: users.avatar,
};

@Injectable()
export class CardRepository extends BaseRepository {
  /**
   * 방 메타 + 요청 유저 멤버십을 한 쿼리로 조회한다 — 홈 헤더(캐릭터·뱃지)
   * 렌더링과 접근 검증을 겸한다. 서브쿼리는 raw sql 비정규화 함정을 피해
   * 쿼리 빌더로 만든다.
   */
  async findActiveRoomForUser(
    roomId: string,
    userId: string,
  ): Promise<CardRoomRow | undefined> {
    const membership = this.db
      .select({ one: sql`1` })
      .from(roomMembers)
      .where(
        and(
          eq(roomMembers.roomId, rooms.id),
          eq(roomMembers.userId, userId),
          isNull(roomMembers.deletedAt),
        ),
      );

    const [room] = await this.db
      .select({
        id: rooms.id,
        type: rooms.type,
        name: rooms.name,
        color: rooms.color,
        isMember: sql<boolean>`${exists(membership)}`,
      })
      .from(rooms)
      .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
      .limit(1);
    return room;
  }

  /**
   * 정렬 기준으로 후보 상위 DECK_SIZE개를 가져온다. 라벨 배정은 서비스가 한다.
   *
   * 스와이프는 기록하지 않으므로 묵힘(`staleness`)은 상세로 들어간 클릭만 리셋한다.
   * 한 번도 열어본 적 없는 핀은 저장 시점을 묵힘으로 쓴다.
   */
  async findCandidates(
    roomId: string,
    userId: string,
    query: ListCardsQuery,
  ): Promise<CandidateRow[]> {
    const staleness = stalenessOfPin(userId);

    return await this.db
      .select({
        id: pins.id,
        roomId: pins.roomId,
        createdAt: pins.createdAt,
        staleness: staleness.mapWith(pins.createdAt).as("staleness"),
        place: CARD_PLACE_COLUMNS,
        author: CARD_AUTHOR_COLUMNS,
        manyComments: activeCommentCount().mapWith(Number).as("many_comments"),
        /*
         * 같은 장소가 저장된 방 수. (room_id, place_id) 활성 유니크라 핀 수 = 방 수다.
         * pins를 자기 자신과 대조해야 해서 서브쿼리 안에서 별칭을 직접 붙인다.
         */
        manySaves: sql<number>`(
          select count(*) from ${pins} as sibling_pins
          where sibling_pins.place_id = ${pins.placeId}
            and sibling_pins.deleted_at is null
        )`
          .mapWith(Number)
          .as("many_saves"),
        manyViews: sql<number>`(
          select count(*) from ${pinAccesses}
          where ${pinAccesses.pinId} = ${pins.id}
        )`
          .mapWith(Number)
          .as("many_views"),
      })
      .from(pins)
      .innerJoin(
        places,
        and(eq(pins.placeId, places.id), isNull(places.deletedAt)),
      )
      .leftJoin(users, eq(pins.createdBy, users.id))
      .where(
        and(
          eq(pins.roomId, roomId),
          isNull(pins.deletedAt),
          this.filter(query),
        ),
      )
      .orderBy(...this.order(query, staleness))
      .limit(DECK_SIZE);
  }

  /** 정렬 기준별 후보 조건. ggukPick은 방 전체를 후보로 본다. */
  private filter(query: ListCardsQuery) {
    if (query.sort === "latest") {
      return gte(
        pins.createdAt,
        sql`now() - ${`${LATEST_WINDOW_DAYS} days`}::interval`,
      );
    }
    if (query.sort === "nearby") {
      // 좌표 필수는 dto에서 검증한다(listCardsQuerySchema).
      return this.withinRadius(query.lat as number, query.lng as number);
    }
    return undefined;
  }

  /** id를 마지막 정렬 키로 둬서 동점에도 순서가 흔들리지 않게 한다. */
  private order(query: ListCardsQuery, staleness: ReturnType<typeof sql>) {
    if (query.sort === "latest") {
      return [desc(pins.createdAt), asc(pins.id)];
    }
    if (query.sort === "nearby") {
      return [
        asc(distanceToPlace(query.lat as number, query.lng as number)),
        asc(pins.id),
      ];
    }
    return [asc(staleness), asc(pins.id)];
  }

  /**
   * 반경 필터. PostGIS가 없어 바운딩 박스로 1차로 거른 뒤 하버사인으로 확정한다.
   * 박스 조건이 먼저 걸려야 나중에 (lat, lng) 인덱스를 태울 수 있다.
   */
  private withinRadius(lat: number, lng: number) {
    const latDelta = NEARBY_RADIUS_METERS / METERS_PER_LAT_DEGREE;
    // 고위도에서 cos가 0에 수렴해 경도 폭이 발산하므로 상한을 둔다.
    const lngDelta = Math.min(
      180,
      latDelta / Math.max(Math.cos((lat * Math.PI) / 180), Number.EPSILON),
    );

    return and(
      gte(places.lat, lat - latDelta),
      sql`${places.lat} <= ${lat + latDelta}`,
      gte(places.lng, lng - lngDelta),
      sql`${places.lng} <= ${lng + lngDelta}`,
      sql`${distanceToPlace(lat, lng)} <= ${NEARBY_RADIUS_METERS}`,
    );
  }
}
