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

describe("TasksService.enqueuePlaceExtraction", () => {
  it("URL payload와 worker endpoint를 사용해 태스크를 만든다", async () => {
    const service = new TasksService(createConfigService());
    let captured: CreateTaskArg | undefined;
    stubClient(service, async (arg) => {
      captured = arg;
      return [{}];
    });

    await service.enqueuePlaceExtraction("https://www.instagram.com/p/abc123/");

    expect(captured?.parent).toBe(
      "projects/team-mino-prod/locations/asia-northeast3/queues/team-mino-prod-place-extraction",
    );
    expect(captured?.task.dispatchDeadline).toEqual({ seconds: 9 * 60 });
    expect(captured?.task.httpRequest.httpMethod).toBe("POST");
    expect(captured?.task.httpRequest.url).toBe(
      "https://api.team-mino.example/internal/tasks/pin-extraction",
    );
    expect(captured?.task.httpRequest.headers).toEqual({
      "Content-Type": "application/json",
    });
    expect(
      JSON.parse(captured?.task.httpRequest.body?.toString() ?? "{}"),
    ).toEqual({ url: "https://www.instagram.com/p/abc123/" });
    expect(captured?.task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: ENV.CLOUD_TASKS_INVOKER_EMAIL,
      audience: ENV.APP_BASE_URL,
    });
  });

  it("APP_BASE_URL 끝 슬래시가 있어도 worker url이 깨지지 않는다", async () => {
    const service = new TasksService(
      createConfigService({ APP_BASE_URL: "https://api.team-mino.example/" }),
    );
    let captured: CreateTaskArg | undefined;
    stubClient(service, async (arg) => {
      captured = arg;
      return [{}];
    });

    await service.enqueuePlaceExtraction("https://www.instagram.com/p/abc/");

    expect(captured?.task.httpRequest.url).toBe(
      "https://api.team-mino.example/internal/tasks/pin-extraction",
    );
    expect(captured?.task.httpRequest.oidcToken.audience).toBe(
      "https://api.team-mino.example",
    );
  });

  it("createTask가 실패하면 그대로 전파한다", async () => {
    const service = new TasksService(createConfigService());
    stubClient(service, async () => {
      throw new Error("UNAVAILABLE");
    });

    await expect(
      service.enqueuePlaceExtraction("https://www.instagram.com/p/abc/"),
    ).rejects.toThrow("UNAVAILABLE");
  });

  it("로컬 모드에서는 Cloud Tasks에 enqueue하지 않는다", async () => {
    const service = new TasksService(
      createConfigService({ CLOUD_TASKS_MODE: "local" }),
    );
    const client = stubClient(service, async () => {
      throw new Error("should not enqueue");
    });

    await expect(
      service.enqueuePlaceExtraction("https://www.instagram.com/p/abc/"),
    ).resolves.toBeUndefined();
    expect(client.createTask).not.toHaveBeenCalled();
  });
});
