import { describe, expect, it, jest } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";
import { TasksService } from "./tasks.service";

const ENV: Record<string, string> = {
  GOOGLE_CLOUD_PROJECT: "team-mino-prod",
  CLOUD_TASKS_LOCATION: "asia-northeast3",
  CLOUD_TASKS_QUEUE: "team-mino-prod-place-extraction",
  APP_BASE_URL: "https://api.team-mino.example",
  CLOUD_TASKS_OIDC_AUDIENCE: "team-mino-place-extraction-worker",
  CLOUD_TASKS_INVOKER_EMAIL:
    "team-mino-prod-tasks-invoker@team-mino-prod.iam.gserviceaccount.com",
};

function createConfigService(
  overrides: Record<string, string> = {},
): ConfigService<Env> {
  const env = { ...ENV, ...overrides };
  return {
    getOrThrow: (key: string) => {
      const value = env[key];
      if (value === undefined) throw new Error(`missing config: ${key}`);
      return value;
    },
  } as unknown as ConfigService<Env>;
}

type CreateTaskArg = {
  parent: string;
  task: {
    name?: string;
    dispatchDeadline?: { seconds: number };
    httpRequest: {
      httpMethod: string;
      url: string;
      oidcToken: { serviceAccountEmail: string; audience: string };
    };
  };
};

// 실제 gRPC/REST 호출 없이 createTask 인자를 포착하도록 client를 교체한다.
function stubClient(
  service: TasksService,
  createTask: (arg: CreateTaskArg) => Promise<unknown>,
  getQueue: () => Promise<unknown> = async () => [
    { retryConfig: { maxAttempts: 10 } },
  ],
) {
  const client = {
    queuePath: (p: string, l: string, q: string) =>
      `projects/${p}/locations/${l}/queues/${q}`,
    createTask: jest.fn(createTask),
    getQueue: jest.fn(getQueue),
  };
  (service as unknown as { client: typeof client }).client = client;
  return client;
}

describe("TasksService.enqueuePlaceExtraction", () => {
  it("정확한 parent/method/url/데드라인/OIDC로 태스크를 만든다", async () => {
    const service = new TasksService(createConfigService());
    let captured: CreateTaskArg | undefined;
    stubClient(service, async (arg) => {
      captured = arg;
      return [{}];
    });

    await service.enqueuePlaceExtraction("job-123");

    const parent =
      "projects/team-mino-prod/locations/asia-northeast3/queues/team-mino-prod-place-extraction";
    expect(captured?.parent).toBe(parent);
    // 이름 지정은 서버측 중복 조회 지연 + 이름 재사용 금지(tombstone)를 부르므로 자동 생성에 맡긴다.
    expect(captured?.task.name).toBeUndefined();
    expect(captured?.task.dispatchDeadline).toEqual({ seconds: 540 });
    expect(captured?.task.httpRequest.httpMethod).toBe("POST");
    expect(captured?.task.httpRequest.url).toBe(
      "https://api.team-mino.example/internal/place/jobs/job-123/process",
    );
    expect(captured?.task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: ENV.CLOUD_TASKS_INVOKER_EMAIL,
      audience: ENV.CLOUD_TASKS_OIDC_AUDIENCE,
    });
  });

  it("APP_BASE_URL 끝 슬래시가 있어도 url이 //internal 로 깨지지 않는다", async () => {
    const service = new TasksService(
      createConfigService({ APP_BASE_URL: "https://api.team-mino.example/" }),
    );
    let captured: CreateTaskArg | undefined;
    stubClient(service, async (arg) => {
      captured = arg;
      return [{}];
    });

    await service.enqueuePlaceExtraction("job-1");

    expect(captured?.task.httpRequest.url).toBe(
      "https://api.team-mino.example/internal/place/jobs/job-1/process",
    );
  });

  it("createTask가 실패하면 그대로 전파한다", async () => {
    const service = new TasksService(createConfigService());
    stubClient(service, async () => {
      throw new Error("UNAVAILABLE");
    });

    await expect(service.enqueuePlaceExtraction("job-1")).rejects.toThrow(
      "UNAVAILABLE",
    );
  });

  it("필수 설정이 없으면 생성 시점(부팅)에 즉시 실패한다", () => {
    const missing = { ...ENV } as Record<string, string | undefined>;
    delete missing.CLOUD_TASKS_QUEUE;

    expect(
      () =>
        new TasksService({
          getOrThrow: (key: string) => {
            const value = missing[key];
            if (value === undefined) throw new Error(`missing config: ${key}`);
            return value;
          },
        } as unknown as ConfigService<Env>),
    ).toThrow("missing config: CLOUD_TASKS_QUEUE");
  });
});

describe("TasksService.getMaxAttempts", () => {
  it("실제 큐의 retryConfig.maxAttempts를 읽고 캐시한다", async () => {
    const service = new TasksService(createConfigService());
    const client = stubClient(
      service,
      async () => [{}],
      async () => [{ retryConfig: { maxAttempts: 10 } }],
    );

    await expect(service.getMaxAttempts()).resolves.toBe(10);
    await expect(service.getMaxAttempts()).resolves.toBe(10);

    expect(client.getQueue).toHaveBeenCalledTimes(1);
    expect(client.getQueue).toHaveBeenCalledWith({
      name: "projects/team-mino-prod/locations/asia-northeast3/queues/team-mino-prod-place-extraction",
    });
  });

  it("큐의 maxAttempts가 없거나 잘못되면 추측하지 않고 실패한다", async () => {
    const service = new TasksService(createConfigService());
    stubClient(
      service,
      async () => [{}],
      async () => [{ retryConfig: {} }],
    );

    await expect(service.getMaxAttempts()).rejects.toThrow(
      "maxAttempts 설정이 올바르지 않습니다",
    );
  });

  it("큐 조회 실패는 캐시하지 않아 다음 호출에서 다시 조회한다", async () => {
    const service = new TasksService(createConfigService());
    let calls = 0;
    const client = stubClient(
      service,
      async () => [{}],
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("UNAVAILABLE");
        return [{ retryConfig: { maxAttempts: 10 } }];
      },
    );

    await expect(service.getMaxAttempts()).rejects.toThrow("UNAVAILABLE");
    await expect(service.getMaxAttempts()).resolves.toBe(10);
    expect(client.getQueue).toHaveBeenCalledTimes(2);
  });
});
