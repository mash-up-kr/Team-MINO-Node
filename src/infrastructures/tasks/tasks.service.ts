import { CloudTasksClient } from "@google-cloud/tasks";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";

@Injectable()
export class TasksService {
  // fallback: true → gRPC 네이티브 의존성 대신 REST 사용(bun --compile 단일 바이너리 번들 안전).
  private readonly client = new CloudTasksClient({ fallback: true });

  constructor(private readonly configService: ConfigService<Env>) {}

  /**
   * place_jobs.id를 그대로 태스크 이름으로 써서, 동일 job이 실수로 두 번 enqueue돼도
   * Cloud Tasks가 ALREADY_EXISTS로 튕겨내게 한다(재배달로 인한 중복 실행 방지는
   * 워커 쪽 job.status 체크가 담당 — 이건 "같은 job 두 번 큐에 넣기"만 막는다).
   */
  async enqueuePlaceExtraction(jobId: string): Promise<void> {
    const project = this.configService.getOrThrow("GOOGLE_CLOUD_PROJECT", {
      infer: true,
    });
    const location = this.configService.getOrThrow("CLOUD_TASKS_LOCATION", {
      infer: true,
    });
    const queue = this.configService.getOrThrow("CLOUD_TASKS_QUEUE", {
      infer: true,
    });
    const baseUrl = this.configService.getOrThrow("APP_BASE_URL", {
      infer: true,
    });
    const audience = this.configService.getOrThrow(
      "CLOUD_TASKS_OIDC_AUDIENCE",
      {
        infer: true,
      },
    );
    const invokerEmail = this.configService.getOrThrow(
      "CLOUD_TASKS_INVOKER_EMAIL",
      { infer: true },
    );

    const parent = this.client.queuePath(project, location, queue);

    await this.client.createTask({
      parent,
      task: {
        name: `${parent}/tasks/${jobId}`,
        httpRequest: {
          httpMethod: "POST",
          url: `${baseUrl}/internal/place/jobs/${jobId}/process`,
          oidcToken: { serviceAccountEmail: invokerEmail, audience },
        },
      },
    });
  }
}
