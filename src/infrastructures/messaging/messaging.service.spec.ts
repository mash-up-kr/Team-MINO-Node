import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import type { ConfigService } from "@nestjs/config";

const getAccessToken = mock(() =>
  Promise.resolve({ token: "fake-access-token" }),
);
const getClient = mock(() => Promise.resolve({ getAccessToken }));
mock.module("google-auth-library", () => ({
  GoogleAuth: class {
    getClient = getClient;
  },
}));

const captureException = mock();
mock.module("@sentry/bun", () => ({ captureException }));

let MessagingService: typeof import("./messaging.service").MessagingService;
beforeAll(async () => {
  ({ MessagingService } = await import("./messaging.service"));
});

function makeService() {
  const config = {
    getOrThrow: () => "test-project",
  } as unknown as ConfigService;
  return new MessagingService(config);
}

describe("MessagingService.sendToTokens", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock();

  beforeEach(() => {
    getClient.mockClear();
    getAccessToken.mockClear();
    captureException.mockClear();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it("토큰별로 FCM v1 messages:send를 호출한다", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await makeService().sendToTokens(["t1", "t2"], {
      title: "제목",
      body: "본문",
      data: { type: "TEST" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://fcm.googleapis.com/v1/projects/test-project/messages:send",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer fake-access-token",
    );
    const body = JSON.parse(init.body as string);
    expect(body.message.token).toBe("t1");
    expect(body.message.notification).toEqual({ title: "제목", body: "본문" });
    expect(body.message.data).toEqual({ type: "TEST" });
  });

  it("응답 실패나 예외를 삼키고 흐름을 끊지 않는다", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(
      makeService().sendToTokens(["t1"], { title: "제목", body: "본문" }),
    ).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
