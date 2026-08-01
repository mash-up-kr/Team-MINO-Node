import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { extractInstagramShortcode } from "../../infrastructures/scraper/instagram.util";
import { TasksService } from "../../infrastructures/tasks/tasks.service";
import { PlaceService } from "./place.service";
import type { PlaceMatch } from "./place.type";
import { PlaceJobRepository, type ReusableJob } from "./place-job.repository";
import type { PlaceJob } from "./place-job.schema";
import { type PlaceJobResponse, toPlaceJobResponse } from "./place-job.type";

interface Failure {
  errorCode: string;
  message: string;
  httpStatus: number;
  retryable: boolean;
}

/*
 * dedup 충돌 후 재사용할 job을 읽는 사이에 그 job이 failed로 바뀌어 사라지는 좁은
 * 레이스를 대비한 재삽입 시도 상한. 무한 재귀/루프를 막는다.
 */
const MAX_INSERT_ATTEMPTS = 3;

/*
 * 워커가 job을 processing으로 선점할 때 거는 lease 유효기간(10분). Cloud Tasks의
 * 9분 디스패치 데드라인보다 길게 두어 재배달이 기존 워커와 중복 claim하지 못하게 한다.
 */
const PROCESSING_LEASE_MS = 10 * 60 * 1000;

// 진단 메시지를 저장할 때의 상한 길이. 예상 밖 오류가 장문/민감정보를 흘리지 않도록 자른다.
const MAX_DIAGNOSTIC_LENGTH = 500;

/*
 * INSERT와 enqueue 사이 크래시로 태스크 없이 pending에 갇힌 job을 판별하는 기준.
 * 정상 재시도 중인 job은 상태 전이 때마다 updatedAt이 갱신되고 Cloud Tasks 백오프
 * 상한(300s)이 이 값보다 짧으므로, 이 시간 넘게 조용한 pending은 잃어버린 job으로 본다.
 */
const STALE_PENDING_MS = PROCESSING_LEASE_MS;

@Injectable()
export class PlaceJobService {
  private readonly logger = new Logger(PlaceJobService.name);

  constructor(
    private readonly placeJobRepository: PlaceJobRepository,
    private readonly tasksService: TasksService,
    private readonly placeService: PlaceService,
  ) {}

  /**
   * 같은 게시글(shortcode) 요청은 early return으로 dedup한다:
   * pending/processing/succeeded job이 있으면 새 job/enqueue 없이 그 jobId를
   * 돌려주고(succeeded면 조회 시 캐시된 결과를 그대로 받는다), failed일 때만
   * 새 job을 만든다. 유일성은 DB partial unique index가 강제한다.
   *
   * 조회를 먼저 하는 이유: 재요청(캐시 히트)이 지배적 트래픽이라, 실패가 예정된
   * INSERT(예외 + dead tuple)를 매번 치르는 대신 인덱스 SELECT 한 번으로 끝낸다.
   * 조회와 삽입 사이의 레이스는 unique index 충돌 → 루프 재조회로 수렴한다.
   */
  async createJob(url: string): Promise<{ jobId: string }> {
    // fetch 없이 URL을 검증하고 dedup 키(shortcode)를 얻는다. 잘못된 URL은 여기서 400.
    const shortcode = extractInstagramShortcode(url);

    for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
      const reusable =
        await this.placeJobRepository.findReusableByShortcode(shortcode);
      if (reusable) {
        await this.rescueIfStale(reusable);
        return { jobId: reusable.id };
      }

      const inserted = await this.placeJobRepository.tryInsert(url, shortcode);
      if (!inserted) {
        // 조회와 삽입 사이에 다른 요청이 먼저 만든 경우 → 다음 루프의 조회가 그 job을 재사용.
        continue;
      }

      await this.enqueueOrFail(inserted.id);
      return { jobId: inserted.id };
    }

    // 조회↔삽입이 상한까지 계속 어긋나는 극단적 경합. 클라이언트는 재시도하면 된다.
    throw new AppException(
      "PLACE_JOB_CONFLICT",
      "작업 생성이 경합으로 실패했습니다. 잠시 후 다시 시도해 주세요.",
      HttpStatus.CONFLICT,
    );
  }

  /**
   * INSERT 직후·enqueue 직전에 프로세스가 죽으면 태스크 없는 pending job이 남고,
   * dedup 때문에 해당 게시글이 영구 차단된다. 오래 조용한 pending을 재사용할 때
   * 태스크를 다시 넣어 스스로 복구한다. lease가 만료됐지만 원래 task가 사라진
   * processing job도 같은 방식으로 복구한다. DB에서 재enqueue 권한을 선점해 동시
   * 재요청 중 한 요청만 task를 만들며, 실패해도 기존 jobId 반환은 막지 않는다.
   */
  private async rescueIfStale(reusable: ReusableJob): Promise<void> {
    const now = new Date();
    const stalePendingBefore = new Date(now.getTime() - STALE_PENDING_MS);
    const isStalePending =
      reusable.status === "pending" && reusable.updatedAt < stalePendingBefore;
    const isExpiredProcessing =
      reusable.status === "processing" &&
      reusable.processingLeaseExpiresAt !== null &&
      reusable.processingLeaseExpiresAt < now;
    if (!isStalePending && !isExpiredProcessing) return;

    const reserved = await this.placeJobRepository.tryReserveStaleRescue(
      reusable.id,
      stalePendingBefore,
      now,
    );
    if (!reserved) return;

    try {
      await this.tasksService.enqueuePlaceExtraction(reusable.id);
    } catch (error) {
      this.logger.warn(
        { err: error, jobId: reusable.id },
        "멈춘 job 재enqueue 실패",
      );
    }
  }

  private async enqueueOrFail(jobId: string): Promise<void> {
    try {
      await this.tasksService.enqueuePlaceExtraction(jobId);
    } catch (error) {
      // enqueue 실패는 terminal failed로 남긴다 → dedup 슬롯을 풀어 재요청이 새 job을 만들 수 있게.
      this.requireTransition(
        await this.placeJobRepository.markFailedBeforeClaim(
          jobId,
          "ENQUEUE_FAILED",
          sanitizeDiagnostic(
            error instanceof Error ? error.message : String(error),
          ),
        ),
      );

      throw new AppException(
        "ENQUEUE_FAILED",
        "작업을 큐에 등록하지 못했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async getJob(jobId: string): Promise<PlaceJobResponse> {
    const job = await this.findJobOrThrow(jobId);
    return toPlaceJobResponse(job);
  }

  /**
   * Cloud Tasks 워커 진입점. 상태머신:
   *  - claim: pending 또는 lease가 만료된 processing 행만 선점하고 10분 lease를 건다.
   *    claim에 성공한 배달만 추출을 실행한다. terminal 상태는 현재 상태를 돌려주고,
   *    다른 배달이 처리 중이면 non-2xx를 반환해 Cloud Tasks가 task를 삭제하지 않게 한다.
   *  - 성공: succeeded로 전이하고 lease와 이전 진단을 비운다.
   *  - 재시도 대상(5xx/예상 밖): lease를 비우고 pending으로 되돌린 뒤 AppException을 던진다.
   *  - 큐 재시도 설정 조회 실패: 안전한 상한을 알 수 없으므로 failed로 종결한다.
   *  - 영구 실패(4xx): lease를 비우고 terminal failed로 남긴 뒤 정상 반환한다.
   *
   * 재시도 여부는 HTTP 응답 코드로 뒤집혀 있다: Cloud Tasks는 non-2xx면 재배달하고 2xx면
   * 멈추므로, "다시 하면 될 실패"는 예외를 던져(non-2xx) 재시도를 유도하고 "포기할 실패"는
   * 정상 반환해(2xx) 재시도를 막는다. 즉 여기서 던지는 예외는 버그가 아니라 재시도 신호다.
   */
  async processJob(
    jobId: string,
    taskRetryCount = 0,
  ): Promise<PlaceJobResponse> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + PROCESSING_LEASE_MS);

    const claimed = await this.placeJobRepository.claimForProcessing(
      jobId,
      now,
      leaseExpiresAt,
    );

    if (!claimed) {
      const job = await this.findJobOrThrow(jobId);
      if (job.status === "pending" || job.status === "processing") {
        throw new AppException(
          "PLACE_JOB_BUSY",
          "다른 워커가 작업을 처리하고 있습니다.",
          HttpStatus.CONFLICT,
          { retryable: true },
        );
      }
      return toPlaceJobResponse(job);
    }

    let result: PlaceMatch[];

    try {
      result = await this.placeService.extractFromUrl(claimed.url);
    } catch (error) {
      const failure = this.toFailure(error);
      const diagnostic = sanitizeDiagnostic(failure.message);

      let maxAttempts: number | undefined;
      if (failure.retryable) {
        try {
          maxAttempts = await this.tasksService.getMaxAttempts();
        } catch (configError) {
          /*
           * 실제 큐 설정을 읽지 못한 상태에서 임의의 재시도 횟수를 적용하면 GCP 설정과
           * 어긋날 수 있다. pending으로 되돌리면 stale rescue가 새 task를 만들며 횟수가
           * 초기화될 수도 있으므로, 이 job은 failed로 종결하고 운영 복구 뒤 새 요청을 받는다.
           */
          const updated = await this.placeJobRepository.markFailed(
            jobId,
            claimed.processingLeaseExpiresAt,
            "CLOUD_TASKS_CONFIG_UNAVAILABLE",
            sanitizeDiagnostic(
              configError instanceof Error
                ? configError.message
                : String(configError),
            ),
          );
          return toPlaceJobResponse(
            await this.currentJobAfterClaimedTransition(jobId, updated),
          );
        }
      }

      /*
       * 유실 복구로 새 task를 만들면 taskRetryCount는 0으로 초기화된다.
       * 최대 횟수는 Cloud Tasks 설정을 따르되, task가 바뀌어도 유지되는
       * job 누적 claim 횟수를 함께 확인해 전체 실행 횟수를 제한한다.
       */
      const isLastAttempt =
        maxAttempts !== undefined &&
        (taskRetryCount + 1 >= maxAttempts || claimed.attempts >= maxAttempts);
      if (failure.retryable && !isLastAttempt) {
        const updated = await this.placeJobRepository.markRetryable(
          jobId,
          claimed.processingLeaseExpiresAt,
          failure.errorCode,
          diagnostic,
        );
        if (!updated) {
          return toPlaceJobResponse(await this.findJobOrThrow(jobId));
        }

        throw new AppException(
          failure.errorCode,
          failure.message,
          failure.httpStatus,
        );
      }

      const updated = await this.placeJobRepository.markFailed(
        jobId,
        claimed.processingLeaseExpiresAt,
        failure.errorCode,
        diagnostic,
      );
      return toPlaceJobResponse(
        await this.currentJobAfterClaimedTransition(jobId, updated),
      );
    }

    const updated = await this.placeJobRepository.markSucceeded(
      jobId,
      claimed.processingLeaseExpiresAt,
      result,
    );
    return toPlaceJobResponse(
      await this.currentJobAfterClaimedTransition(jobId, updated),
    );
  }

  private async findJobOrThrow(jobId: string) {
    const job = await this.placeJobRepository.findById(jobId);

    if (!job) {
      throw new AppException(
        "PLACE_JOB_NOT_FOUND",
        "존재하지 않는 job입니다.",
        HttpStatus.NOT_FOUND,
      );
    }

    return job;
  }

  private requireTransition(job: PlaceJob | undefined): PlaceJob {
    if (!job) {
      throw new AppException(
        "PLACE_JOB_TRANSITION_CONFLICT",
        "작업 상태 변경 대상이 없습니다.",
        HttpStatus.CONFLICT,
      );
    }

    return job;
  }

  private async currentJobAfterClaimedTransition(
    jobId: string,
    updated: PlaceJob | undefined,
  ): Promise<PlaceJob> {
    return updated ?? this.findJobOrThrow(jobId);
  }

  private toFailure(error: unknown): Failure {
    if (error instanceof AppException) {
      const httpStatus = error.getStatus();
      return {
        errorCode: error.errorCode,
        message: error.message,
        httpStatus,
        /*
         * 예외가 재시도 여부를 명시하면 그것을 따르고(예: 비결정적 AI 응답의 422),
         * 아니면 5xx=일시 오류로 추정한다.
         */
        retryable: error.retryable ?? httpStatus >= 500,
      };
    }

    return {
      errorCode: "WORKER_UNEXPECTED_ERROR",
      message: error instanceof Error ? error.message : String(error),
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      retryable: true,
    };
  }
}

/*
 * job 행에 남길 진단 메시지를 정제한다. 길이를 제한하고 개행/제어문자를 공백으로 접어,
 * 예상 밖 오류 메시지가 장문이거나 토큰/시크릿 유사 문자열을 통째로 남기는 것을 줄인다.
 */
function sanitizeDiagnostic(message: string): string {
  const collapsed = message.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_DIAGNOSTIC_LENGTH
    ? `${collapsed.slice(0, MAX_DIAGNOSTIC_LENGTH)}…`
    : collapsed;
}
