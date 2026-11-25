import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { DatabaseService } from "../../infrastructures/db/database.service";
import { pins } from "../pin/pin.schema";
import { pinComments } from "../pin/pin-comment.schema";
import { rooms } from "../room/room.schema";
import { roomMembers } from "../room/room-member.schema";
import { type UserAvatar, users } from "../user/user.schema";

@Injectable()
export class CommentRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async findActivePin(
    pinId: string,
  ): Promise<{ id: string; roomId: string } | undefined> {
    const [pin] = await this.db
      .select({ id: pins.id, roomId: pins.roomId })
      .from(pins)
      .innerJoin(rooms, and(eq(pins.roomId, rooms.id), isNull(rooms.deletedAt)))
      .where(and(eq(pins.id, pinId), isNull(pins.deletedAt)))
      .limit(1);

    return pin;
  }

  async hasActiveMembership(roomId: string, userId: string): Promise<boolean> {
    const [membership] = await this.db
      .select({ id: roomMembers.id })
      .from(roomMembers)
      .where(
        and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, userId),
          isNull(roomMembers.deletedAt),
        ),
      )
      .limit(1);

    return membership !== undefined;
  }

  async findActiveComments(pinId: string, offset: number, limit: number) {
    return this.db
      .select({
        id: pinComments.id,
        content: pinComments.content,
        createdAt: pinComments.createdAt,
        authorId: users.id,
        // 작성 시점 스냅샷 우선, 없으면(마이그레이션 이전 행) 현재 프로필로 폴백.
        // 스냅샷 존재 여부는 author_nickname으로 판정한다 — 아바타는 작성 당시
        // "없음"일 수 있어 NULL 자체가 유효한 스냅샷이라 존재 표시로 쓸 수 없다.
        // 닉네임은 users에서 NOT NULL이라 새 행의 스냅샷에 항상 값이 있다.
        authorNickname:
          sql<string>`coalesce(${pinComments.authorNickname}, ${users.nickname})`.as(
            "author_nickname",
          ),
        authorAvatar:
          sql<UserAvatar | null>`case when ${pinComments.authorNickname} is not null then ${pinComments.authorAvatar} else ${users.avatar} end`.as(
            "author_avatar",
          ),
      })
      .from(pinComments)
      .innerJoin(users, eq(pinComments.createdBy, users.id))
      .where(and(eq(pinComments.pinId, pinId), isNull(pinComments.deletedAt)))
      .orderBy(desc(pinComments.createdAt), desc(pinComments.id))
      .offset(offset)
      .limit(limit);
  }

  async create(
    pinId: string,
    createdBy: string,
    content: string,
    author: { nickname: string; avatar: UserAvatar | null },
  ) {
    return await this.db.transaction(async (tx) => {
      // 핀이 활성 상태인지 row lock(FOR SHARE)으로 확인하여 동시 삭제와의 경합을 직렬화한다.
      const [pin] = await tx
        .select({ id: pins.id })
        .from(pins)
        .where(and(eq(pins.id, pinId), isNull(pins.deletedAt)))
        .for("share");

      if (!pin) {
        return undefined;
      }

      const [comment] = await tx
        .insert(pinComments)
        .values({
          pinId,
          createdBy,
          content,
          authorNickname: author.nickname,
          authorAvatar: author.avatar,
        })
        .returning({
          id: pinComments.id,
          content: pinComments.content,
          createdAt: pinComments.createdAt,
        });

      return comment;
    });
  }

  async findActiveComment(pinId: string, commentId: string) {
    const [comment] = await this.db
      .select({ id: pinComments.id, createdBy: pinComments.createdBy })
      .from(pinComments)
      .where(
        and(
          eq(pinComments.id, commentId),
          eq(pinComments.pinId, pinId),
          isNull(pinComments.deletedAt),
        ),
      )
      .limit(1);

    return comment;
  }

  async softDelete(commentId: string): Promise<boolean> {
    const [deleted] = await this.db
      .update(pinComments)
      .set({ deletedAt: new Date() })
      .where(and(eq(pinComments.id, commentId), isNull(pinComments.deletedAt)))
      .returning({ id: pinComments.id });

    return deleted !== undefined;
  }
}
