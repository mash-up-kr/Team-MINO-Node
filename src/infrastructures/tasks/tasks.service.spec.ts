import { afterEach, describe, expect, it, jest } from "bun:test";
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

type TaskBody = {
  task: {
    dispatchDeadline?: string;
    httpRequest: {
      httpMethod: string;
      url: string;
      headers?: Record<string, string>;
      body?: string;
      oidcToken: { serviceAccountEmail: string; audience: string };
    };
  };
};

const originalFetch = globalThis.fetch;

/** access token 발급을 막고, 호출된 요청을 그대로 돌려줍니다. */
function stubTransport(service: TasksService, response = new Response("{}")) {
  (
    service as unknown as { auth: { getAccessToken: () => Promise<string> } }
  ).auth = { getAccessToken: async () => "test-token" };

  const fetchMock = jest.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function capture(fetchMock: ReturnType<typeof stubTransport>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    { headers: Record<string, string>; body: string },
  ];
  return {
    url,
    headers: init.headers,
    body: JSON.parse(init.body) as TaskBody,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("TasksService.enqueuePlaceExtraction", () => {
  it("URL payload와 internal endpoint를 사용해 태스크를 만든다", async () => {
    // given
    const service = new TasksService(createConfigService());
    const fetchMock = stubTransport(service);

    // when
    await service.enqueuePlaceExtraction("https://www.instagram.com/p/abc123/");

    // then
    const { url, headers, body } = await capture(fetchMock);
    expect(url).toBe(
      "https://cloudtasks.googleapis.com/v2/projects/team-mino-prod/locations/asia-northeast3/queues/team-mino-prod-place-extraction/tasks",
    );
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(body.task.dispatchDeadline).toBe(`${9 * 60}s`);
    expect(body.task.httpRequest.httpMethod).toBe("POST");
    expect(body.task.httpRequest.url).toBe(
      "https://api.team-mino.example/internal/tasks/pin-extraction",
    );
    expect(body.task.httpRequest.headers).toEqual({
      "Content-Type": "application/json",
    });
    // REST는 body를 base64로 받습니다.
    expect(
      JSON.parse(
        Buffer.from(body.task.httpRequest.body ?? "", "base64").toString(),
      ),
    ).toEqual({ url: "https://www.instagram.com/p/abc123/" });
    expect(body.task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: ENV.CLOUD_TASKS_INVOKER_EMAIL,
      audience: ENV.APP_BASE_URL,
    });
  });

  it("APP_BASE_URL 끝 슬래시가 있어도 internal url이 깨지지 않는다", async () => {
    // given
    const service = new TasksService(
      createConfigService({ APP_BASE_URL: "https://api.team-mino.example/" }),
    );
    const fetchMock = stubTransport(service);

    // when
    await service.enqueuePlaceExtraction("https://www.instagram.com/p/abc/");

    // then
    const { body } = await capture(fetchMock);
    expect(body.task.httpRequest.url).toBe(
      "https://api.team-mino.example/internal/tasks/pin-extraction",
    );
    expect(body.task.httpRequest.oidcToken.audience).toBe(
      "https://api.team-mino.example",
    );
  });

  it("createTask가 실패하면 상태 코드와 응답 본문을 담아 던진다", async () => {
    // given
    const service = new TasksService(createConfigService());
    stubTransport(service, new Response("queue not found", { status: 404 }));

    // when / then
    await expect(
      service.enqueuePlaceExtraction("https://www.instagram.com/p/abc/"),
    ).rejects.toThrow("Cloud Tasks createTask 실패 (404): queue not found");
  });

  it("로컬 모드에서는 Cloud Tasks에 enqueue하지 않는다", async () => {
    // given
    const service = new TasksService(
      createConfigService({ CLOUD_TASKS_MODE: "local" }),
    );
    const fetchMock = stubTransport(service);

    // when / then
    await expect(
      service.enqueuePlaceExtraction("https://www.instagram.com/p/abc/"),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
