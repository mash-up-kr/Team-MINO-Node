import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import { pins } from "../pin/pin.schema";
import { pinComments } from "../pin/pin-comment.schema";
import { places } from "../place/place.schema";
import { roomMembers } from "../room/room-member.schema";
import { users } from "../user/user.schema";
import {
  type NotificationPayload,
  type NotificationType,
  notifications,
} from "./notification.schema";
import type { NotificationItemResponse } from "./notification.type";

export type NearbyPlace = {
  placeId: string;
  pinId: string;
  placeName: string;
  thumbnailUrl: string | null;
};

export type TopCommentedPlace = {
  userId: string;
  placeId: string;
  pinId: string;
  placeName: string;
  thumbnailUrl: string | null;
  fcmToken: string | null;
};

export type RecordNotificationInput = {
  recipientId: string;
  type: NotificationType;
  typeLabel: string;
  targetName: string;
  thumbnailUrl?: string;
  payload?: NotificationPayload;
  key?: string;
};

@Injectable()
export class NotificationRepository extends BaseRepository {
  async record(input: RecordNotificationInput): Promise<{ id: string } | null> {
    const [row] = await this.db
      .insert(notifications)
      .values(input)
      .onConflictDoNothing({
        target: [notifications.recipientId, notifications.key],
        where: and(
          isNotNull(notifications.key),
          isNull(notifications.deletedAt),
        ),
      })
      .returning({ id: notifications.id });

    return row ?? null;
  }

  async findTopCommentedPlacePerUser(): Promise<TopCommentedPlace[]> {
    const ranked = this.db
      .select({
        userId: roomMembers.userId,
        fcmToken: users.fcmToken,
        placeId: places.id,
        placeName: places.name,
        thumbnailUrl: sql<string | null>`${places.images} ->> 0`.as(
          "thumbnail_url",
        ),
        // 조인 행이 핀×코멘트라 최빈 핀이 곧 코멘트가 가장 많은 핀이다.
        pinId: sql<string>`mode() within group (order by ${pins.id})`.as(
          "pin_id",
        ),
        rank: sql<number>`row_number() over (partition by "room_members"."user_id" order by count(${pinComments.id}) desc, "places"."id")`.as(
          "rank",
        ),
      })
      .from(roomMembers)
      .innerJoin(
        users,
        and(eq(users.id, roomMembers.userId), isNull(users.deletedAt)),
      )
      .innerJoin(
        pins,
        and(eq(pins.roomId, roomMembers.roomId), isNull(pins.deletedAt)),
      )
      .innerJoin(
        places,
        and(eq(places.id, pins.placeId), isNull(places.deletedAt)),
      )
      .innerJoin(
        pinComments,
        and(eq(pinComments.pinId, pins.id), isNull(pinComments.deletedAt)),
      )
      .where(
        and(
          isNull(roomMembers.deletedAt),
          sql`not exists (
            select 1 from ${notifications} n
            where n.recipient_id = ${roomMembers.userId}
              and n.type = 'TOP_COMMENTED_PLACE'
              and n.payload->>'placeId' = ${places.id}::text
              and n.deleted_at is null
              and (n.created_at at time zone 'Asia/Seoul')::date
                  > (now() at time zone 'Asia/Seoul')::date - 5
          )`,
        ),
      )
      .groupBy(roomMembers.userId, users.fcmToken, places.id)
      .as("ranked");

    return this.db
      .select({
        userId: ranked.userId,
        fcmToken: ranked.fcmToken,
        placeId: ranked.placeId,
        pinId: ranked.pinId,
        placeName: ranked.placeName,
        thumbnailUrl: ranked.thumbnailUrl,
      })
      .from(ranked)
      .where(eq(ranked.rank, 1));
  }

  async findAccessiblePlaces(
    userId: string,
    placeIds: string[],
  ): Promise<NearbyPlace[]> {
    // 같은 장소가 내 방 여러 곳에 있어도 한 건이다. 가장 최근 저장한 핀으로 연다.
    return this.db
      .selectDistinctOn([places.id], {
        placeId: places.id,
        pinId: pins.id,
        placeName: places.name,
        thumbnailUrl: sql<string | null>`${places.images} ->> 0`,
      })
      .from(pins)
      .innerJoin(
        places,
        and(eq(places.id, pins.placeId), isNull(places.deletedAt)),
      )
      .innerJoin(
        roomMembers,
        and(
          eq(roomMembers.roomId, pins.roomId),
          eq(roomMembers.userId, userId),
          isNull(roomMembers.deletedAt),
        ),
      )
      .where(and(inArray(pins.placeId, placeIds), isNull(pins.deletedAt)))
      .orderBy(places.id, desc(pins.createdAt), desc(pins.id));
  }

  async findPushToken(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ fcmToken: users.fcmToken })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    return row?.fcmToken ?? null;
  }

  async findPage(
    recipientId: string,
    { limit, offset }: { limit: number; offset: number },
  ): Promise<NotificationItemResponse[]> {
    return this.db
      .select({
        id: notifications.id,
        type: notifications.type,
        typeLabel: notifications.typeLabel,
        targetName: notifications.targetName,
        thumbnailUrl: notifications.thumbnailUrl,
        payload: notifications.payload,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, recipientId),
          isNull(notifications.deletedAt),
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit)
      .offset(offset);
  }
}
