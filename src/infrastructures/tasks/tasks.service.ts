import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleAuth } from "google-auth-library";
import type { Env } from "../../config/env.schema";

/* Cloud Tasks가 Internal endpoint 응답을 기다리는 최대 시간입니다. */
const TASK_DISPATCH_DEADLINE_SECONDS = 9 * 60;

const CLOUD_TASKS_API_ROOT = "https://cloudtasks.googleapis.com/v2";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

/*
 * @google-cloud/tasks(gax) 대신 REST를 fetch로 직접 호출한다.
 * gax는 gapic 클라이언트 설정을 런타임에 동적 require하는데, 이 파일이
 * `bun build --compile` 산출물(단일 바이너리)의 가상 파일시스템에 포함되지
 * 않아 부팅 시 "Cannot find module ... cloud_tasks_client_config.json"으로
 * 죽는다. enqueue는 REST 호출 하나뿐이라 클라이언트 라이브러리가 필요 없다.
 */
@Injectable()
export class TasksService {
  private readonly auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });

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

    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `${CLOUD_TASKS_API_ROOT}/${this.queueParent}/tasks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task: {
            // google.protobuf.Duration의 REST JSON 표현: 초 단위 뒤에 "s".
            dispatchDeadline: `${TASK_DISPATCH_DEADLINE_SECONDS}s`,
            httpRequest: {
              httpMethod: "POST",
              url: `${this.targetBaseUrl}/internal/tasks/pin-extraction`,
              headers: { "Content-Type": "application/json" },
              // bytes 필드의 REST JSON 표현은 base64 문자열.
              body: Buffer.from(JSON.stringify({ url })).toString("base64"),
              oidcToken: this.oidcToken,
            },
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Cloud Tasks enqueue failed: ${response.status} ${await response.text()}`,
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const { token } = await client.getAccessToken();
    if (!token) {
      throw new Error("Cloud Tasks 인증 토큰을 가져오지 못했습니다.");
    }
    return token;
  }
}
