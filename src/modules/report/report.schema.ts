import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "../user/user.schema";

export const REPORT_TARGET_TYPES = ["pin", "pin_comment", "user"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "SEXUAL",
  "HATE",
  "ILLEGAL",
  "OTHER",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = [
  "pending",
  "reviewed",
  "actioned",
  "dismissed",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/*
 * 신고 시점의 대상 콘텐츠 스냅샷. 대상(핀/댓글/유저)은 가변이라
 * 신고 이후 수정되면 위반 증거가 소실되므로, 접수 시점에 본문을 박제한다.
 * 채우는 건 PR-2(POST API)의 책임이고, 컬럼만 이 마이그레이션에 미리 둔다.
 * - pin_comment: { content }
 * - user: { nickname }
 * - pin: 핀 자체에 본문이 없어 { roomId, placeId } 정도를 넣는다.
 */
export type ReportTargetSnapshot = {
  content?: string;
  nickname?: string;
  roomId?: string;
  pinId?: string;
  placeId?: string;
};

/*
 * UGC 신고 접수 테이블 (PR-1).
 * - 폴리모픽 타겟: pin / pin_comment / user를 targetType + targetId로 받는다.
 *   (주의: targetType 'pin_comment'는 단수형. 실제 테이블명은 복수형 pin_comments다.)
 *   FK를 걸지 않는 대신, 존재하지 않는 타겟도 201로 받고 저장한다
 *   (유저 열거 방지 + pin/comment/user 리포지토리를 엮지 않아 PR을 작게 유지).
 *   유효성 판단은 처리 단계에서 dismiss로 다룬다.
 * - 조회/처리는 PR-1 범위 밖이다. 처리 방식이 정해지면 이 테이블을
 *   그대로 재사용할 수 있게 상태 전이용 컬럼(status/actionMemo/actedAt/actedBy)을
 *   미리 넣어둔다.
 * - 앱 레벨(valibot) 검증을 우회하는 경로가 생겨도 DB가 오염되지 않도록
 *   유효성 가드를 아래 CHECK 제약으로 박아둔다.
 * - PR-2 동시 POST 주의: 중복 방지가 부분 유니크 인덱스이므로
 *   onConflictDoNothing에는 where 절이 필수다:
 *   onConflictDoNothing({ target: [t.reporterId, t.targetType, t.targetId],
 *     where: sql`${t.status} = 'pending'` })
 *   where 없이 target만 주면 "no unique constraint matching" 런타임 에러가 난다.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid().primaryKey().defaultRandom(),
    reporterId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "no action" }),
    targetType: varchar({ length: 16 }).$type<ReportTargetType>().notNull(),
    // 폴리모픽 타겟 id. pin / pin_comments / users의 id가 들어간다.
    targetId: uuid().notNull(),
    reason: varchar({ length: 16 }).$type<ReportReason>().notNull(),
    // 신고 상세. 길이 상한(500자)은 PR-2 DTO(valibot)에서 검증하고,
    // DB CHECK(2000자)는 직접 DB를 건드리는 경로에 대한 백스톱이다.
    detail: text(),
    targetSnapshot: jsonb().$type<ReportTargetSnapshot>(),
    status: varchar({ length: 16 })
      .$type<ReportStatus>()
      .notNull()
      .default("pending"),
    // 운영 메모. pending 상태에서도 조사 메모를 남길 수 있으므로 NULL 허용이다.
    actionMemo: text(),
    actedAt: timestamp({ withTimezone: true }),
    // 처리자. 식별이 안 되는 처리 주체도 있을 수 있어 nullable이며,
    // CHECK로 강제하지 않는다. 이름 같은 식별자는 actionMemo에 남기면 된다.
    actedBy: uuid().references(() => users.id, { onDelete: "no action" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // 직접 DB를 건드리는 경로의 오염 방지. $type<>은 TS 타입일 뿐
    // DB를 안 지키므로 CHECK가 필수다.
    // 오타 상태값('reviewd')는 큐에서 영구 소실 + dedup 누수로 이어진다.
    check(
      "reports_status_check",
      sql`${t.status} in ('pending','reviewed','actioned','dismissed')`,
    ),
    check(
      "reports_target_type_check",
      sql`${t.targetType} in ('pin','pin_comment','user')`,
    ),
    check(
      "reports_reason_check",
      sql`${t.reason} in ('SPAM','HARASSMENT','SEXUAL','HATE','ILLEGAL','OTHER')`,
    ),
    check(
      "reports_detail_len_check",
      sql`${t.detail} is null or char_length(${t.detail}) <= 2000`,
    ),
    // 전이 규율: pending이면 미처리(actedAt NULL), 처리됐으면 처리 시각 필수.
    // memo는 pending 메모를 허용하므로 강제하지 않는다.
    // (주의: updatedAt의 $onUpdate는 drizzle 클라이언트에서만 동작하고
    // 날(raw) SQL에서는 갱신 안 되므로, 처리 시각의 진실 원천은 actedAt이다.)
    check(
      "reports_state_check",
      sql`(${t.status} = 'pending' and ${t.actedAt} is null) or (${t.status} <> 'pending' and ${t.actedAt} is not null)`,
    ),
    // 같은 타겟에 대한 pending 중복 신고 방지. 처리済み(reviewed/actioned/dismissed)
    // 이후의 재신고는 허용한다.
    uniqueIndex("reports_reporter_target_pending_unique")
      .on(t.reporterId, t.targetType, t.targetId)
      .where(sql`${t.status} = 'pending'`),
    // 상태별 최신순 조회용
    index().on(t.status, t.createdAt),
    // 타겟별 신고 이력 조회용
    index().on(t.targetType, t.targetId),
    // 신고자별 이력 조회용 (부분 유니크는 pending만 커버하므로 별도 인덱스 필요)
    index().on(t.reporterId, t.createdAt),
  ],
);
