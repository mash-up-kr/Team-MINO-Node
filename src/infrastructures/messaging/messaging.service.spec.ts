import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { App } from "firebase-admin/app";

const sendEachForMulticast = mock(() =>
  Promise.resolve({
    successCount: 1,
    failureCount: 0,
    responses: [{ success: true }],
  }),
);
mock.module("firebase-admin/messaging", () => ({
  getMessaging: () => ({ sendEachForMulticast }),
}));

let MessagingService: typeof import("./messaging.service").MessagingService;
beforeAll(async () => {
  ({ MessagingService } = await import("./messaging.service"));
});

function makeService() {
  const report = mock(() => undefined);
  const service = new MessagingService({} as App, { report } as never);
  return { service, report };
}

describe("MessagingService.sendToTokens", () => {
  beforeEach(() => {
    sendEachForMulticast.mockClear();
  });

  const sentMessage = () =>
    (
      sendEachForMulticast.mock.calls[0] as unknown as [Record<string, unknown>]
    )[0];

  it("Android가 백그라운드에서도 받도록 data-only로 보내고 iOS 표시는 aps.alert가 맡는다", async () => {
    const { service } = makeService();

    await service.sendToTokens(["t1", "t2"], {
      title: "제목",
      body: "본문",
      data: { type: "TEST" },
    });

    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
    const message = sentMessage();
    expect(message.tokens).toEqual(["t1", "t2"]);
    expect(message.notification).toBeUndefined();
    expect(message.data).toEqual({ type: "TEST", title: "제목", body: "본문" });
    expect(message.android).toEqual({ priority: "high" });
    expect(message.apns).toMatchObject({
      headers: { "apns-priority": "10" },
      payload: { aps: { alert: { title: "제목", body: "본문" } } },
    });
  });

  it("이미지가 있으면 Android는 data로, iOS는 fcmOptions와 mutableContent로 싣는다", async () => {
    const { service } = makeService();

    await service.sendToTokens(["t1"], {
      title: "제목",
      body: "본문",
      imageUrl: "https://cdn.example/a.jpg",
      data: { type: "TEST" },
    });

    const message = sentMessage();
    expect(message.data).toMatchObject({
      imageUrl: "https://cdn.example/a.jpg",
    });
    expect(message.apns).toMatchObject({
      payload: { aps: { mutableContent: true } },
      fcmOptions: { imageUrl: "https://cdn.example/a.jpg" },
    });
  });

  it("이미지가 없으면 관련 필드를 넣지 않는다", async () => {
    const { service } = makeService();

    await service.sendToTokens(["t1"], { title: "제목", body: "본문" });

    const message = sentMessage();
    expect(message.data).not.toHaveProperty("imageUrl");
    expect(message.apns).not.toHaveProperty("fcmOptions");
    expect(
      (message.apns as { payload: { aps: Record<string, unknown> } }).payload
        .aps,
    ).not.toHaveProperty("mutableContent");
  });

  it("토큰이 없으면 발송하지 않는다", async () => {
    const { service } = makeService();

    await service.sendToTokens([], { title: "제목", body: "본문" });

    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("일부 토큰 실패는 삼키고 Sentry로 보내지 않는다", async () => {
    const { service, report } = makeService();
    sendEachForMulticast.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered" },
        },
      ],
    } as never);

    await expect(
      service.sendToTokens(["t1", "t2"], { title: "제목", body: "본문" }),
    ).resolves.toBeUndefined();

    expect(report).not.toHaveBeenCalled();
  });

  it("예외는 삼키고 고정 메시지로 보고한다", async () => {
    const { service, report } = makeService();
    sendEachForMulticast.mockRejectedValueOnce(
      new Error("network down") as never,
    );

    await expect(
      service.sendToTokens(["t1"], { title: "제목", body: "본문" }),
    ).resolves.toBeUndefined();

    expect(report).toHaveBeenCalledWith(expect.any(Error), {
      errorCode: "FCM_SEND_FAILED",
      extra: { cause: expect.stringContaining("network down") },
    });
  });
});
