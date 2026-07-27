import { CloudTasksClient } from "@google-cloud/tasks";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";

/*
 * 워커 processing lease(10분)보다 1분 짧은 디스패치 데드라인. 재배달이 lease 만료와
 * 동시에 도착해 기존 워커와 새 워커가 같은 job을 함께 claim하는 경계 경쟁을 피한다.
 */
const WORKER_DISPATCH_DEADLINE_SECONDS = 9 * 60;
const QUEUE_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class TasksService {
  // fallback: true → gRPC 네이티브 의존성 대신 REST 사용(bun --compile 단일 바이너리 번들 안전).
  private readonly client = new CloudTasksClient({ fallback: true });

  /*
   * 전부 프로세스 수명 동안 불변인 값들. 생성자에서 한 번 읽어 두면 env 누락이
   * 첫 사용자 요청이 아니라 부팅 시점에 바로 드러난다(fail-fast).
   */
  private readonly queueParent: string;
  private readonly workerBaseUrl: string;
  private readonly oidcToken: { serviceAccountEmail: string; audience: string };
  private maxAttemptsCache?: { value: number; expiresAt: number };
  private maxAttemptsRequest?: Promise<number>;

  constructor(configService: ConfigService<Env>) {
    const project = configService.getOrThrow("GOOGLE_CLOUD_PROJECT", {
      infer: true,
    });
    const location = configService.getOrThrow("CLOUD_TASKS_LOCATION", {
      infer: true,
    });
    const queue = configService.getOrThrow("CLOUD_TASKS_QUEUE", {
      infer: true,
    });
    const baseUrl = configService.getOrThrow("APP_BASE_URL", { infer: true });

    this.queueParent = this.client.queuePath(project, location, queue);
    // APP_BASE_URL 끝에 슬래시가 붙어 있어도 경로가 //internal 로 깨지지 않게 정규화.
    this.workerBaseUrl = baseUrl.replace(/\/+$/, "");
    this.oidcToken = {
      serviceAccountEmail: configService.getOrThrow(
        "CLOUD_TASKS_INVOKER_EMAIL",
        { infer: true },
      ),
      audience: configService.getOrThrow("CLOUD_TASKS_OIDC_AUDIENCE", {
        infer: true,
      }),
    };
  }

  /**
   * 태스크 이름은 지정하지 않는다(자동 생성). 이름을 지정하면 Cloud Tasks가
   * 서버측 중복 조회를 돌려 생성 지연이 커지고, 삭제된 이름은 ~1시간 재사용이
   * 막힌다. 같은 job의 중복 실행은 워커의 조건부 claim이 이미 방지하므로
   * 이름 기반 dedup 없이도 안전하다(중복 배달은 no-op으로 수렴).
   */
  async enqueuePlaceExtraction(jobId: string): Promise<void> {
    await this.client.createTask({
      parent: this.queueParent,
      task: {
        /*
         * 이 시간 안에 2xx가 없으면 Cloud Tasks가 재배달한다. 재배달 시점에도 기존
         * 10분 lease가 남아 있어 새 배달은 같은 job을 중복 claim하지 못한다.
         */
        dispatchDeadline: { seconds: WORKER_DISPATCH_DEADLINE_SECONDS },
        httpRequest: {
          httpMethod: "POST",
          url: `${this.workerBaseUrl}/internal/place/jobs/${jobId}/process`,
          oidcToken: this.oidcToken,
        },
      },
    });
  }

  /**
   * 최종 시도 판정 기준은 별도 env가 아니라 실제 Cloud Tasks 큐 설정에서 읽는다.
   * 짧게 캐시해 매 실패마다 API를 호출하지 않으면서도 Pulumi 설정 변경을 반영한다.
   */
  async getMaxAttempts(): Promise<number> {
    const cached = this.maxAttemptsCache;
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    if (!this.maxAttemptsRequest) {
      this.maxAttemptsRequest = this.loadMaxAttempts().finally(() => {
        this.maxAttemptsRequest = undefined;
      });
    }

    return this.maxAttemptsRequest;
  }

  private async loadMaxAttempts(): Promise<number> {
    const [queue] = await this.client.getQueue({ name: this.queueParent });
    const maxAttempts = queue.retryConfig?.maxAttempts;

    if (
      typeof maxAttempts !== "number" ||
      !Number.isInteger(maxAttempts) ||
      maxAttempts < 1
    ) {
      throw new Error("Cloud Tasks 큐의 maxAttempts 설정이 올바르지 않습니다.");
    }

    this.maxAttemptsCache = {
      value: maxAttempts,
      expiresAt: Date.now() + QUEUE_CONFIG_CACHE_TTL_MS,
    };
    return maxAttempts;
  }
}
