import { describe, expect, it, jest } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";
import { TasksService } from "./tasks.service";

const ENV: Record<string, string> = {
  APP_ENV: "local",
  GOOGLE_CLOUD_PROJECT: "team-mino-prod",
  CLOUD_TASKS_LOCATION: "asia-northeast3",
  CLOUD_TASKS_QUEUE: "team-mino-prod-place-extraction",
  APP_BASE_URL: "https://api.team-mino.example",
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
    get: (key: string) => env[key],
  } as unknown as ConfigService<Env>;
}

type CreateTaskArg = {
  parent: string;
  task: {
    dispatchDeadline?: { seconds: number };
    httpRequest: {
      httpMethod: string;
      url: string;
      headers?: Record<string, string>;
      body?: Buffer;
      oidcToken: { serviceAccountEmail: string; audience: string };
    };
  };
};

function stubClient(
  service: TasksService,
  createTask: (arg: CreateTaskArg) => Promise<unknown>,
) {
  const client = {
    queuePath: (p: string, l: string, q: string) =>
      `projects/${p}/locations/${l}/queues/${q}`,
    createTask: jest.fn(createTask),
  };
  (service as unknown as { client: typeof client }).client = client;
  return client;
}

describe("TasksService.enqueuePinExtraction", () => {
  const payload = {
    roomId: "11111111-1111-4111-8111-111111111111",
    sourceId: "22222222-2222-4222-8222-222222222222",
    createdBy: "33333333-3333-4333-8333-333333333333",
    url: "https://www.instagram.com/p/abc123/",
  };

  it("방·출처·생성자·URL을 그대로 internal 핀 task에 담는다", async () => {
    const service = new TasksService(createConfigService());
    let captured: CreateTaskArg | undefined;
    stubClient(service, async (arg) => {
      captured = arg;
      return [{}];
    });

    await service.enqueuePinExtraction(payload);

    expect(captured?.task.httpRequest.url).toBe(
      "https://api.team-mino.example/api-internal/v1/tasks/pins",
    );
    expect(
      JSON.parse(captured?.task.httpRequest.body?.toString() ?? "{}"),
    ).toEqual(payload);
  });

  it("APP_BASE_URL 끝 슬래시와 로컬 모드를 안전하게 처리한다", async () => {
    const service = new TasksService(
      createConfigService({
        APP_BASE_URL: "https://api.team-mino.example/",
        CLOUD_TASKS_MODE: "local",
      }),
    );
    const client = stubClient(service, async () => {
      throw new Error("should not enqueue");
    });

    await expect(
      service.enqueuePinExtraction(payload),
    ).resolves.toBeUndefined();
    expect(client.createTask).not.toHaveBeenCalled();
  });

  it("createTask 실패를 그대로 전파한다", async () => {
    const service = new TasksService(createConfigService());
    stubClient(service, async () => {
      throw new Error("UNAVAILABLE");
    });

    await expect(service.enqueuePinExtraction(payload)).rejects.toThrow(
      "UNAVAILABLE",
    );
  });
});
