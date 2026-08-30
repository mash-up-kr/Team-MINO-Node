import { describe, expect, it, mock } from "bun:test";
import { NotificationService } from "./notification.service";

const input = {
  recipientId: "u1",
  type: "ROOM_JOINED_SELF" as const,
  typeLabel: "방에 참가했어요",
  targetName: "우리끼리",
  url: "https://gguk.org/rooms/r1",
};

function makeService() {
  const record = mock(() => Promise.resolve({ id: "n1" }));
  const sendToTokens = mock(() => Promise.resolve());
  const service = new NotificationService(
    { record } as never,
    { sendToTokens } as never,
  );
  return { service, record, sendToTokens };
}

describe("NotificationService.recordAndNotify", () => {
  it("기록하고, 토큰이 있으면 저장한 문구 그대로 발송한다", async () => {
    const { service, record, sendToTokens } = makeService();

    await service.recordAndNotify(input, "token-1");

    expect(record).toHaveBeenCalledWith(input);
    expect(sendToTokens).toHaveBeenCalledWith(["token-1"], {
      title: input.targetName,
      body: input.typeLabel,
      data: { type: input.type, url: input.url },
    });
  });

  it("토큰이 없으면 기록만 하고 발송하지 않는다", async () => {
    const { service, sendToTokens } = makeService();

    await service.recordAndNotify(input, null);

    expect(sendToTokens).not.toHaveBeenCalled();
  });
});
