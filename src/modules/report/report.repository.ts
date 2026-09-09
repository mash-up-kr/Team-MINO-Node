import { Injectable } from "@nestjs/common";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { BaseRepository } from "../../infrastructures/db/base.repository";
import type { DatabaseService } from "../../infrastructures/db/database.service";
import { pins } from "../pin/pin.schema";
import { pinComments } from "../pin/pin-comment.schema";
import { users } from "../user/user.schema";
import type { CreateReportRequest } from "./report.dto";
import {
  type ReportTargetSnapshot,
  type ReportTargetType,
  reports,
} from "./report.schema";

export type SubmitReportInput = {
  readonly reporterId: string;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly reason: CreateReportRequest["reason"];
  readonly detail?: string;
  /** 24시간 신고 한도. 정책 값의 주인은 서비스이고, 개수는 여기서만 센다. */
  readonly dailyLimit: number;
  readonly windowStart: Date;
};

export type SubmitReportResult =
  | {
      readonly kind: "created";
      readonly id: string;
      readonly createdAt: Date;
    }
  | { readonly kind: "duplicate" }
  | { readonly kind: "rate_limited" }
  | { readonly kind: "self" }
  | { readonly kind: "unknown_reporter" };

type ReportTransaction = Parameters<
  Parameters<DatabaseService["db"]["transaction"]>[0]
>[0];

@Injectable()
export class ReportRepository extends BaseRepository {
  /**
   * 신고 접수 전체를 하나의 트랜잭션으로 처리한다.
   *
   * - 신고자 행 `FOR UPDATE`: 같은 신고자의 병렬 요청을 직렬화해
   *   count-then-insert TOCTOU(한도 무력화)를 막는다. 타 유저 요청은
   *   다른 행을 잠그므로 처리량에 영향을 주지 않는다.
   * - 타겟 조회에 `deletedAt` 필터를 두지 않는다: 소프트삭제돼도 행·본문은
   *   남으므로 증거 스냅샷을 확정적으로 박제할 수 있고, 지운 뒤 자기
   *   콘텐츠를 신고하는 우회도 막힌다. (삭제 자체가 행을 없애지 않으므로
   *   별도 row lock 없이도 스냅샷-적재 race가 성립하지 않는다.)
   * - `ON CONFLICT`는 최후 방어선이다 (선조회와 insert 사이 경합 대비).
   */
  async submit(input: SubmitReportInput): Promise<SubmitReportResult> {
    return await this.db.transaction(async (tx) => {
      // user 타겟 자기신고는 DB를 만지기 전에 확정된다.
      if (input.targetType === "user" && input.targetId === input.reporterId) {
        return { kind: "self" } as const;
      }

      // 탈퇴 경합(가드 통과 후 탈퇴)도 여기서 걸린다. users는 소프트삭제만
      // 존재하므로 deletedAt 필터가 탈퇴 판정의 전부다.
      const [reporter] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.reporterId), isNull(users.deletedAt)))
        .for("update")
        .limit(1);
      if (!reporter) {
        // insert FK 위반(500) 대신 401로 내린다.
        return { kind: "unknown_reporter" } as const;
      }

      // 429보다 409를 먼저 확정한다.
      // 이 SELECT는 부분 유니크 인덱스가 정확히 커버한다.
      const [pending] = await tx
        .select({ id: reports.id })
        .from(reports)
        .where(
          and(
            eq(reports.reporterId, input.reporterId),
            eq(reports.targetType, input.targetType),
            eq(reports.targetId, input.targetId),
            eq(reports.status, "pending"),
          ),
        )
        .limit(1);
      if (pending) {
        return { kind: "duplicate" } as const;
      }

      // 자기-콘텐츠 판정은 rate 체크보다 먼저다. 한도가 찬 유저의
      // 자기신고가 429가 아니라 400으로 끝나야 일관된다.
      const snapshot = await this.resolveSnapshot(tx, input);
      if (snapshot === "self") {
        return { kind: "self" } as const;
      }

      // 기각·처리済み 포함 전부 센다: 오신고 반복도 쿼터를 먹어야
      // 신고 괴롭힘(같은 유저를 계속 신고하는 행위)을 막을 수 있다.
      const [counter] = await tx
        .select({ value: count() })
        .from(reports)
        .where(
          and(
            eq(reports.reporterId, input.reporterId),
            gt(reports.createdAt, input.windowStart),
          ),
        );
      if ((counter?.value ?? 0) >= input.dailyLimit) {
        return { kind: "rate_limited" } as const;
      }

      const [created] = await tx
        .insert(reports)
        .values({
          reporterId: input.reporterId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          detail: input.detail ?? null,
          targetSnapshot: snapshot,
          status: "pending",
        })
        .onConflictDoNothing({
          target: [reports.reporterId, reports.targetType, reports.targetId],
          where: sql`${reports.status} = 'pending'`,
        })
        .returning({ id: reports.id, createdAt: reports.createdAt });
      if (!created) {
        return { kind: "duplicate" } as const;
      }
      return {
        kind: "created",
        id: created.id,
        createdAt: created.createdAt,
      } as const;
    });
  }

  /**
   * 타겟 조회 + 자기-콘텐츠 판정 + 스냅샷 조립.
   * 행이 없으면 null(그래도 접수는 받는다 — 유저 열거 방지),
   * 자기 것이면 "self"를 돌려준다.
   */
  private async resolveSnapshot(
    tx: ReportTransaction,
    input: SubmitReportInput,
  ): Promise<ReportTargetSnapshot | null | "self"> {
    switch (input.targetType) {
      case "pin": {
        const [row] = await tx
          .select({
            roomId: pins.roomId,
            placeId: pins.placeId,
            createdBy: pins.createdBy,
          })
          .from(pins)
          .where(eq(pins.id, input.targetId))
          .limit(1);
        if (!row) return null;
        if (row.createdBy === input.reporterId) return "self";
        return { roomId: row.roomId, placeId: row.placeId };
      }
      case "pin_comment": {
        const [row] = await tx
          .select({
            content: pinComments.content,
            pinId: pinComments.pinId,
            createdBy: pinComments.createdBy,
          })
          .from(pinComments)
          .where(eq(pinComments.id, input.targetId))
          .limit(1);
        if (!row) return null;
        if (row.createdBy === input.reporterId) return "self";
        return { content: row.content, pinId: row.pinId };
      }
      case "user": {
        const [row] = await tx
          .select({ nickname: users.nickname })
          .from(users)
          .where(eq(users.id, input.targetId))
          .limit(1);
        // 탈퇴해도 nickname 행은 남는다. 열거 방지를 위해 존재 여부는 숨기고,
        // 스냅샷이 있으면 박제한다.
        return row ? { nickname: row.nickname } : null;
      }
    }
  }
}
