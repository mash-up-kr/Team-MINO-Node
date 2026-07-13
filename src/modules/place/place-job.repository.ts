import { Injectable } from "@nestjs/common";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { DatabaseService } from "../../infrastructures/db/database.service";
import { type PlaceJob, placeJobs } from "./place.schema";
import type { PlaceCandidate } from "./place.type";

/*
 * 재사용 가능(pending/processing/succeeded) job의 shortcode 유일성을 강제하는
 * partial unique index 이름. 이 제약 위반(23505)만 dedup 경로로 처리하고,
 * 그 외 DB 오류는 그대로 전파한다.
 */
const DEDUP_SHORTCODE_INDEX = "place_jobs_dedup_shortcode_idx";

/*
 * pending/processing/succeeded = 같은 게시글 재요청 시 재사용하는 상태.
 * failed일 때만 새 job을 허용한다.
 */
const REUSABLE_STATUSES = ["pending", "processing", "succeeded"] as const;

type ProcessingClaim = PlaceJob & {
  status: "processing";
  processingLeaseExpiresAt: Date;
};

/** place_jobs 테이블 접근 전담. 상태 전이 규칙(무엇을 언제 바꾸는가)은 서비스가 결정한다. */
@Injectable()
export class PlaceJobRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * 새 job 삽입을 시도한다. dedup 인덱스 충돌이면 null을 반환하고(호출부가 기존 job을
   * 재사용), 그 외 DB 오류는 그대로 전파한다.
   */
  async tryInsert(
    url: string,
    shortcode: string,
  ): Promise<{ id: string } | null> {
    try {
      const [job] = await this.db
        .insert(placeJobs)
        .values({ url, shortcode })
        .returning({ id: placeJobs.id });
      return job;
    } catch (error) {
      if (isDedupShortcodeConflict(error)) {
        return null;
      }
      throw error;
    }
  }

  async findReusableByShortcode(
    shortcode: string,
  ): Promise<
    { id: string; status: PlaceJob["status"]; updatedAt: Date } | undefined
  > {
    const [job] = await this.db
      .select({
        id: placeJobs.id,
        status: placeJobs.status,
        updatedAt: placeJobs.updatedAt,
      })
      .from(placeJobs)
      .where(
        and(
          eq(placeJobs.shortcode, shortcode),
          inArray(placeJobs.status, [...REUSABLE_STATUSES]),
        ),
      )
      .limit(1);
    return job;
  }

  async findById(jobId: string): Promise<PlaceJob | undefined> {
    const [job] = await this.db
      .select()
      .from(placeJobs)
      .where(eq(placeJobs.id, jobId))
      .limit(1);
    return job;
  }

  /**
   * 단일 조건부 UPDATE로 pending 또는 (processing + lease 만료) 행만 processing으로
   * 선점한다. 선점 실패(동시 배달·미만료 lease·terminal·미존재)면 undefined.
   * 선점할 때마다 attempts를 1 올려 job 전체의 누적 시도 횟수를 남긴다.
   */
  async claimForProcessing(
    jobId: string,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<ProcessingClaim | undefined> {
    const [claimed] = await this.db
      .update(placeJobs)
      .set({
        status: "processing",
        processingLeaseExpiresAt: leaseExpiresAt,
        attempts: sql`${placeJobs.attempts} + 1`,
      })
      .where(
        and(
          eq(placeJobs.id, jobId),
          or(
            eq(placeJobs.status, "pending"),
            and(
              eq(placeJobs.status, "processing"),
              lt(placeJobs.processingLeaseExpiresAt, now),
            ),
          ),
        ),
      )
      .returning();
    return claimed as ProcessingClaim | undefined;
  }

  /** 성공 종료. lease와 이전 진단(errorCode/Message)을 함께 비운다. */
  markSucceeded(
    jobId: string,
    processingLeaseExpiresAt: Date,
    result: PlaceCandidate[],
  ): Promise<PlaceJob | undefined> {
    return this.transition(jobId, processingLeaseExpiresAt, {
      status: "succeeded",
      result,
      errorCode: null,
      errorMessage: null,
    });
  }

  /** 재시도 대상 실패. lease를 비우고 pending으로 되돌려 다음 배달이 다시 claim하게 한다. */
  markRetryable(
    jobId: string,
    processingLeaseExpiresAt: Date,
    errorCode: string,
    errorMessage: string,
  ): Promise<PlaceJob | undefined> {
    return this.transition(jobId, processingLeaseExpiresAt, {
      status: "pending",
      errorCode,
      errorMessage,
    });
  }

  /** 영구 실패(terminal). dedup 슬롯이 풀려 같은 게시글 재요청이 새 job을 만들 수 있다. */
  markFailed(
    jobId: string,
    processingLeaseExpiresAt: Date,
    errorCode: string,
    errorMessage: string,
  ): Promise<PlaceJob | undefined> {
    return this.transition(jobId, processingLeaseExpiresAt, {
      status: "failed",
      errorCode,
      errorMessage,
    });
  }

  /** enqueue 전에 실패한 job은 아직 claim 주체가 없으므로 job ID만으로 실패 처리한다. */
  markFailedBeforeClaim(
    jobId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<PlaceJob | undefined> {
    return this.transitionPending(jobId, {
      status: "failed",
      errorCode,
      errorMessage,
    });
  }

  private async transitionPending(
    jobId: string,
    set: Partial<PlaceJob> & { status: PlaceJob["status"] },
  ): Promise<PlaceJob | undefined> {
    const [updated] = await this.db
      .update(placeJobs)
      .set({ ...set, processingLeaseExpiresAt: null })
      .where(and(eq(placeJobs.id, jobId), eq(placeJobs.status, "pending")))
      .returning();
    return updated;
  }

  /** 모든 상태 전이의 공통 형태: 지정 필드 반영 + lease 해제. 한곳만 고치면 되도록 모은다. */
  private async transition(
    jobId: string,
    processingLeaseExpiresAt: Date | undefined,
    set: Partial<PlaceJob> & { status: PlaceJob["status"] },
  ): Promise<PlaceJob | undefined> {
    const [updated] = await this.db
      .update(placeJobs)
      .set({ ...set, processingLeaseExpiresAt: null })
      .where(
        processingLeaseExpiresAt
          ? and(
              eq(placeJobs.id, jobId),
              eq(placeJobs.status, "processing"),
              eq(placeJobs.processingLeaseExpiresAt, processingLeaseExpiresAt),
            )
          : eq(placeJobs.id, jobId),
      )
      .returning();
    return updated;
  }
}

/*
 * PostgreSQL unique_violation(23505) 중 dedup partial unique index 위반인지 판별.
 * postgres-js는 PostgresError에 SQLSTATE(code)와 constraint_name을 담지만, drizzle이 이를
 * DrizzleQueryError로 감싸고 실제 오류를 .cause에 넣으므로 cause 체인을 훑어 원본을 찾는다.
 * code/constraint 둘 다 대조해, 다른 unique 제약이나 무관한 DB 오류를 dedup 경로로 삼키지 않는다.
 */
function isDedupShortcodeConflict(error: unknown): boolean {
  const pg = unwrapPostgresError(error);
  return pg?.code === "23505" && pg.constraintName === DEDUP_SHORTCODE_INDEX;
}

function unwrapPostgresError(
  error: unknown,
): { code: string; constraintName?: string } | null {
  /*
   * cause 체인을 따라가며 SQLSTATE(code)를 담은 원본 PostgresError를 찾는다. 순환/과도한
   * 깊이를 방지하기 위해 상한을 둔다.
   */
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth++
  ) {
    const { code, constraint_name } = current as {
      code?: unknown;
      constraint_name?: unknown;
    };
    if (typeof code === "string") {
      return {
        code,
        constraintName:
          typeof constraint_name === "string" ? constraint_name : undefined,
      };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}
