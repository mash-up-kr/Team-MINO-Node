import { CloudTasksClient } from "@google-cloud/tasks";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";

/*
 * 워커 processing lease(place-job.service의 10분)와 동일하게 맞춘 디스패치 데드라인(초).
 * Cloud Tasks HTTP 태스크 기본 데드라인은 짧으므로, 추출이 오래 걸려도 lease와 어긋나지 않게 한다.
 */
const WORKER_DISPATCH_DEADLINE_SECONDS = 600;

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
         * 워커의 processing lease(10분)와 맞춘 디스패치 데드라인. 이 시간 안에 2xx가 없으면
         * Cloud Tasks가 재배달하며, 그때 만료된 lease를 다른 배달이 다시 claim할 수 있다.
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
}
