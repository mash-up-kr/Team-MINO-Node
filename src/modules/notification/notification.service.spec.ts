import { describe, expect, it, mock } from "bun:test";
import { NotificationService } from "./notification.service";

const input = {
  recipientId: "u1",
  type: "ROOM_JOINED_SELF" as const,
  typeLabel: "방에 참가했어요",
  targetName: "우리끼리",
  payload: { roomId: "r1" },
};

function makeService(repository: Record<string, unknown> = {}) {
  const repo = {
    record: mock(
      (): Promise<{ id: string } | null> => Promise.resolve({ id: "n1" }),
    ),
    ...repository,
  };
  const sendToTokens = mock(() => Promise.resolve());
  const report = mock(() => undefined);
  const service = new NotificationService(
    repo as never,
    { sendToTokens } as never,
    { report } as never,
  );
  return { service, record: repo.record, sendToTokens, report };
}

describe("NotificationService.recordAndNotify", () => {
  it("기록하고, 토큰이 있으면 저장한 문구 그대로 발송한다", async () => {
    const { service, record, sendToTokens } = makeService();

    await service.recordAndNotify(input, "token-1");

    expect(record).toHaveBeenCalledWith(input);
    expect(sendToTokens).toHaveBeenCalledWith(["token-1"], {
      title: input.targetName,
      body: input.typeLabel,
      data: { type: input.type, roomId: "r1" },
    });
  });

  it("토큰이 없으면 기록만 하고 발송하지 않는다", async () => {
    const { service, sendToTokens } = makeService();

    await service.recordAndNotify(input, null);

    expect(sendToTokens).not.toHaveBeenCalled();
  });

  it("이미 같은 키로 남아 있으면 발송도 건너뛴다", async () => {
    const { service, sendToTokens } = makeService({
      record: mock(() => Promise.resolve(null)),
    });

    await service.recordAndNotify({ ...input, key: "dup" }, "token-1");

    expect(sendToTokens).not.toHaveBeenCalled();
  });

  it("기록이 실패해도 던지지 않고 Sentry로만 보고한다", async () => {
    const { service, sendToTokens, report } = makeService({
      record: mock(() => Promise.reject(new Error("db down"))),
    });

    await service.recordAndNotify(input, "token-1");

    expect(report).toHaveBeenCalledTimes(1);
    expect(sendToTokens).not.toHaveBeenCalled();
  });

  it("inbox: false면 기록하지 않고 발송만 한다 (FR-019 대표 알림)", async () => {
    const { service, record, sendToTokens } = makeService();

    await service.recordAndNotify(input, "token-1", { inbox: false });

    expect(record).not.toHaveBeenCalled();
    expect(sendToTokens).toHaveBeenCalledTimes(1);
  });
});

describe("NotificationService.recordAndNotifyUser", () => {
  it("토큰 조회가 실패해도 알림함 기록은 계속한다", async () => {
    const error = new Error("db down");
    const { service, record, sendToTokens, report } = makeService({
      findPushToken: mock(() => Promise.reject(error)),
    });

    await service.recordAndNotifyUser(input);

    expect(record).toHaveBeenCalledWith(input);
    expect(sendToTokens).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(error, {
      errorCode: "NOTIFICATION_TOKEN_LOOKUP_FAILED",
    });
  });
});

describe("NotificationService.remindTopCommentedPlaces", () => {
  const target = {
    userId: "u1",
    fcmToken: "token-1",
    placeId: "p1",
    pinId: "pin-1",
    placeName: "어니언 성수",
    thumbnailUrl: "https://example.com/0.jpg",
  };

  const makeBatch = (targets: (typeof target)[]) =>
    makeService({
      findTopCommentedPlacePerUser: mock(() => Promise.resolve(targets)),
    });

  it("유저마다 코멘트 최다 장소를 장소 상세 링크로 알린다", async () => {
    const { service, record, sendToTokens } = makeBatch([target]);

    expect(await service.remindTopCommentedPlaces()).toBe(1);
    expect(record).toHaveBeenCalledWith({
      recipientId: "u1",
      type: "TOP_COMMENTED_PLACE",
      typeLabel: "코멘트가 제일 많이 달린 장소에요",
      targetName: "어니언 성수",
      thumbnailUrl: "https://example.com/0.jpg",
      payload: { placeId: "p1", pinId: "pin-1" },
      key: expect.stringMatching(/^TOP_COMMENTED_PLACE:p1:\d{4}-\d{2}-\d{2}$/),
    });
    expect(sendToTokens).toHaveBeenCalledTimes(1);
  });

  it("대상이 청크 크기를 넘어도 전원에게 보낸다", async () => {
    const many = Array.from({ length: 120 }, (_, index) => ({
      ...target,
      userId: `u${index}`,
    }));
    const { service, record } = makeBatch(many);

    expect(await service.remindTopCommentedPlaces()).toBe(120);
    expect(record).toHaveBeenCalledTimes(120);
  });

  it("토큰이 없으면 알림함에만 남긴다", async () => {
    const { service, record, sendToTokens } = makeBatch([
      { ...target, fcmToken: null as never },
    ]);

    await service.remindTopCommentedPlaces();

    expect(record).toHaveBeenCalledTimes(1);
    expect(sendToTokens).not.toHaveBeenCalled();
  });
});
