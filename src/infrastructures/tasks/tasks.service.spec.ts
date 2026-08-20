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

type CapturedRequest = { url: string; init: RequestInit };

function stubAuth(service: TasksService, token = "fake-access-token") {
  const auth = {
    getClient: async () => ({
      getAccessToken: async () => ({ token }),
    }),
  };
  (service as unknown as { auth: typeof auth }).auth = auth;
}

function stubFetch(response: {
  ok: boolean;
  status?: number;
  text?: () => Promise<string>;
}) {
  let captured: CapturedRequest | undefined;
  const fetchMock = jest.fn(async (url: string, init: RequestInit) => {
    captured = { url, init };
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      text: response.text ?? (async () => ""),
    } as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, getCaptured: () => captured };
}

function parsedBody(init: RequestInit) {
  return JSON.parse(init.body as string);
}

describe("TasksService.enqueuePlaceExtraction", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("URL payload와 internal endpoint를 사용해 태스크를 만든다", async () => {
    const service = new TasksService(createConfigService());
    stubAuth(service);
    const { getCaptured } = stubFetch({ ok: true });

    await service.enqueuePlaceExtraction("https://www.instagram.com/p/abc123/");

    const captured = getCaptured();
    expect(captured?.url).toBe(
      "https://cloudtasks.googleapis.com/v2/projects/team-mino-prod/locations/asia-northeast3/queues/team-mino-prod-place-extraction/tasks",
    );
    expect(
      (captured?.init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer fake-access-token");

    const body = parsedBody(captured?.init ?? {});
    expect(body.task.dispatchDeadline).toBe("540s");
    expect(body.task.httpRequest.httpMethod).toBe("POST");
    expect(body.task.httpRequest.url).toBe(
      "https://api.team-mino.example/internal/tasks/pin-extraction",
    );
    expect(body.task.httpRequest.headers).toEqual({
      "Content-Type": "application/json",
    });
    expect(
      JSON.parse(Buffer.from(body.task.httpRequest.body, "base64").toString()),
    ).toEqual({ url: "https://www.instagram.com/p/abc123/" });
    expect(body.task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: ENV.CLOUD_TASKS_INVOKER_EMAIL,
      audience: ENV.APP_BASE_URL,
    });
  });

  it("APP_BASE_URL 끝 슬래시가 있어도 internal url이 깨지지 않는다", async () => {
    const service = new TasksService(
      createConfigService({ APP_BASE_URL: "https://api.team-mino.example/" }),
    );
    stubAuth(service);
    const { getCaptured } = stubFetch({ ok: true });

    await service.enqueuePlaceExtraction("https://www.instagram.com/p/abc/");

    const body = parsedBody(getCaptured()?.init ?? {});
    expect(body.task.httpRequest.url).toBe(
      "https://api.team-mino.example/internal/tasks/pin-extraction",
    );
    expect(body.task.httpRequest.oidcToken.audience).toBe(
      "https://api.team-mino.example",
    );
  });

  it("Cloud Tasks 응답이 실패면 에러를 던진다", async () => {
    const service = new TasksService(createConfigService());
    stubAuth(service);
    stubFetch({ ok: false, status: 503, text: async () => "UNAVAILABLE" });

    await expect(
      service.enqueuePlaceExtraction("https://www.instagram.com/p/abc/"),
    ).rejects.toThrow("Cloud Tasks enqueue failed: 503 UNAVAILABLE");
  });

  it("로컬 모드에서는 Cloud Tasks에 enqueue하지 않는다", async () => {
    const service = new TasksService(
      createConfigService({ CLOUD_TASKS_MODE: "local" }),
    );
    stubAuth(service);
    const { fetchMock } = stubFetch({ ok: true });

    await expect(
      service.enqueuePlaceExtraction("https://www.instagram.com/p/abc/"),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
