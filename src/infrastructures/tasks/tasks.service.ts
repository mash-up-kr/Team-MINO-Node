import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleAuth } from "google-auth-library";
import type { Env } from "../../config/env.schema";

/* Cloud Tasks가 Internal endpoint 응답을 기다리는 최대 시간입니다. */
const TASK_DISPATCH_DEADLINE_SECONDS = 9 * 60;

/*
 * @google-cloud/tasks 대신 REST를 직접 호출합니다. SDK는 import.meta.url 기준 경로로
 * client_config·protos JSON을 런타임에 읽는데, bun --compile 단일 바이너리에는 그 파일들이
 * 없어 기동 즉시 죽습니다. fallback: true는 전송 계층만 REST로 바꿔서 해결되지 않습니다.
 */
const CLOUD_TASKS_API = "https://cloudtasks.googleapis.com/v2";

@Injectable()
export class TasksService {
  private readonly auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });

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

    this.queueParent = `projects/${project}/locations/${location}/queues/${queue}`;
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

    await this.createTask({
      // REST는 duration을 "540s" 형태 문자열로, body를 base64로 받습니다.
      dispatchDeadline: `${TASK_DISPATCH_DEADLINE_SECONDS}s`,
      httpRequest: {
        httpMethod: "POST",
        url: `${this.targetBaseUrl}/internal/tasks/pin-extraction`,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify({ url })).toString("base64"),
        oidcToken: this.oidcToken,
      },
    });
  }

  private async createTask(task: unknown): Promise<void> {
    const accessToken = await this.auth.getAccessToken();

    const response = await fetch(
      `${CLOUD_TASKS_API}/${this.queueParent}/tasks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ task }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Cloud Tasks createTask 실패 (${response.status}): ${await response.text()}`,
      );
    }
  }
}
