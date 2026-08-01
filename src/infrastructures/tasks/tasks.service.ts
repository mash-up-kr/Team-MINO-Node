import { CloudTasksClient } from "@google-cloud/tasks";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";

/* Cloud Tasks가 Internal endpoint 응답을 기다리는 최대 시간입니다. */
const TASK_DISPATCH_DEADLINE_SECONDS = 9 * 60;

@Injectable()
export class TasksService {
  // fallback: true → gRPC 네이티브 의존성 대신 REST 사용(bun --compile 단일 바이너리 번들 안전).
  private readonly client = new CloudTasksClient({ fallback: true });

  /*
   * 전부 프로세스 수명 동안 불변인 값들. 생성자에서 한 번 읽어 두면 env 누락이
   * 첫 사용자 요청이 아니라 부팅 시점에 바로 드러난다(fail-fast).
   */
  private readonly queueParent: string;
  private readonly targetBaseUrl: string;
  private readonly oidcToken: { serviceAccountEmail: string; audience: string };
  private readonly isLocalMode: boolean;

  constructor(configService: ConfigService<Env>) {
    this.isLocalMode =
      configService.get("APP_ENV", { infer: true }) === "local" &&
      configService.get("CLOUD_TASKS_MODE", { infer: true }) === "local";

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
    this.targetBaseUrl = baseUrl.replace(/\/+$/, "");
    this.oidcToken = {
      serviceAccountEmail: configService.getOrThrow(
        "CLOUD_TASKS_INVOKER_EMAIL",
        { infer: true },
      ),
      // Cloud Run IAM은 수신 서비스 URL을 audience로 요구한다.
      audience: this.targetBaseUrl,
    };
  }

  /** API 서버가 맡는 유일한 비동기 작업 책임입니다. */
  async enqueuePlaceExtraction(url: string): Promise<void> {
    if (this.isLocalMode) return;

    await this.client.createTask({
      parent: this.queueParent,
      task: {
        dispatchDeadline: { seconds: TASK_DISPATCH_DEADLINE_SECONDS },
        httpRequest: {
          httpMethod: "POST",
          url: `${this.targetBaseUrl}/internal/tasks/pin-extraction`,
          headers: { "Content-Type": "application/json" },
          body: Buffer.from(JSON.stringify({ url })),
          oidcToken: this.oidcToken,
        },
      },
    });
  }
}
