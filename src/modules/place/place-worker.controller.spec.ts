import { describe, expect, it, jest } from "bun:test";
import { HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { GeoCandidate } from "../../infrastructures/geocoder/geocoder.type";
import type { PlaceService } from "./place.service";
import type { PlaceMatch } from "./place.type";
import type { PlaceResultRepository } from "./place-result.repository";
import { PlaceWorkerController } from "./place-worker.controller";

const URL = "https://instagram.com/p/abc123/";
const MAX_ATTEMPTS = 10;
const ENQUEUED_AT = "2026-08-30T00:00:00.000Z";
const TASK = {
  roomIds: ["11111111-1111-4111-8111-111111111111"],
  sourceId: "22222222-2222-4222-8222-222222222222",
  createdBy: "33333333-3333-4333-8333-333333333333",
  url: URL,
  enqueuedAt: ENQUEUED_AT,
};

const DUPLICATED = {
  pinId: "55555555-5555-4555-8555-555555555555",
  placeId: "44444444-4444-4444-8444-444444444444",
  placeName: "어니언 성수",
  thumbnailUrl: "https://example.com/0.jpg",
};

const saveResult = (over: Record<string, unknown> = {}) => ({
  retryableFailures: 0,
  persistedPlaces: 0,
  duplicatedPlaces: [],
  ...over,
});

function createController() {
  const extractFromUrl = jest.fn();
  const activeRoomIdsForTask = jest.fn().mockResolvedValue(TASK.roomIds);
  const save = jest.fn().mockResolvedValue(saveResult());
  const recordAndNotifyUser = jest.fn().mockResolvedValue(undefined);
  const placeService: Pick<PlaceService, "extractFromUrl"> = {
    extractFromUrl,
  };
  const placeResultRepository: Pick<
    PlaceResultRepository,
    "activeRoomIdsForTask" | "save"
  > = {
    activeRoomIdsForTask,
    save,
  };

  return {
    controller: new PlaceWorkerController(
      placeService,
      placeResultRepository,
      { recordAndNotifyUser } as never,
      { getOrThrow: () => MAX_ATTEMPTS } as never,
    ),
    extractFromUrl,
    activeRoomIdsForTask,
    save,
    recordAndNotifyUser,
  };
}

const CANDIDATE: GeoCandidate = {
  provider: "kakao",
  providerPlaceId: "kakao-1",
  placeName: "어니언 성수",
  address: "서울 성동구 아차산로 8",
  coordinate: { lat: 37.5445, lng: 127.0559 },
};

const SUCCESSFUL_MATCH: PlaceMatch = {
  extracted: {
    placeName: "어니언 성수",
    areaName: "성수동",
    areaType: "landmark",
    relation: "카페",
  },
  matches: [CANDIDATE],
  geocoding: { status: "fulfilled" },
};

const FAILED_MATCH: PlaceMatch = {
  ...SUCCESSFUL_MATCH,
  matches: [],
  geocoding: { status: "rejected", reason: new Error("provider down") },
};

describe("PlaceWorkerController retry policy", () => {
  it("부분 geocoder 실패는 성공 장소를 저장한 뒤 503으로 재시도한다", async () => {
    const { controller, extractFromUrl, save } = createController();
    extractFromUrl.mockResolvedValue([SUCCESSFUL_MATCH, FAILED_MATCH]);
    save.mockResolvedValue(
      saveResult({ retryableFailures: 1, persistedPlaces: 1 }),
    );

    await expect(controller.process(TASK)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(save).toHaveBeenCalledWith(TASK, [SUCCESSFUL_MATCH, FAILED_MATCH]);
  });

  it("모든 geocoder 실패는 저장 없이 503으로 재시도한다", async () => {
    const { controller, extractFromUrl, save } = createController();
    extractFromUrl.mockRejectedValue(
      new AppException(
        "GEOCODER_ALL_FAILED",
        "장소 검색이 모두 실패했습니다.",
        HttpStatus.BAD_GATEWAY,
      ),
    );

    await expect(controller.process(TASK)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("fulfilled empty 결과는 재시도하지 않고 acknowledge한다", async () => {
    const { controller, extractFromUrl, save } = createController();
    extractFromUrl.mockResolvedValue([{ ...SUCCESSFUL_MATCH, matches: [] }]);
    save.mockResolvedValue(saveResult());

    await expect(controller.process(TASK)).resolves.toBeUndefined();
  });

  it("stale task는 추출하지 않고 acknowledge한다", async () => {
    const { controller, extractFromUrl, activeRoomIdsForTask } =
      createController();
    activeRoomIdsForTask.mockResolvedValue([]);

    await expect(controller.process(TASK)).resolves.toBeUndefined();
    expect(extractFromUrl).not.toHaveBeenCalled();
  });

  it("malformed task는 추출하지 않고 204 acknowledge한다", async () => {
    const { controller, extractFromUrl } = createController();

    await expect(controller.process({ url: URL })).resolves.toBeUndefined();
    expect(extractFromUrl).not.toHaveBeenCalled();
  });

  it("방이 11개인 task도 추출한다", async () => {
    const { controller, extractFromUrl, activeRoomIdsForTask } =
      createController();
    const roomIds = Array.from(
      { length: 11 },
      (_, index) =>
        `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    );
    activeRoomIdsForTask.mockResolvedValue(roomIds);
    extractFromUrl.mockResolvedValue([]);

    await expect(
      controller.process({ ...TASK, roomIds }),
    ).resolves.toBeUndefined();
    expect(extractFromUrl).toHaveBeenCalledWith(URL);
  });

  it("retryable=true인 4xx는 503으로 변환해 Cloud Tasks 재시도를 보장한다", async () => {
    const { controller, extractFromUrl, save } = createController();
    const error = new AppException(
      "AI_SCHEMA_MISMATCH",
      "AI 응답이 스키마와 일치하지 않습니다.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      { retryable: true },
    );
    extractFromUrl.mockRejectedValue(error);

    // 422를 그대로 재전파하면 Cloud Tasks가 영구 실패로 폐기하므로,
    // 재시도가 보장되는 503으로 변환되어야 한다.
    const thrown: unknown = await controller
      .process(TASK)
      .catch((error_) => error_);

    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    const exception = thrown as ServiceUnavailableException;
    expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(exception.getResponse()).toMatchObject({
      errorCode: "AI_SCHEMA_MISMATCH",
    });
    expect(exception.cause).toBe(error);
    expect(save).not.toHaveBeenCalled();
  });

  it("카카오 요청 제한(429)은 재시도한다", async () => {
    const { controller, extractFromUrl, save } = createController();
    const error = new AppException(
      "KAKAO_RATE_LIMITED",
      "카카오 장소 검색 요청 한도를 초과했습니다.",
      HttpStatus.TOO_MANY_REQUESTS,
      { retryable: true },
    );
    extractFromUrl.mockRejectedValue(error);

    await expect(controller.process(TASK)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("retryable=false이면 오류를 acknowledge해 재시도하지 않는다", async () => {
    const { controller, extractFromUrl, save } = createController();
    const error = new AppException(
      "INVALID_IMAGE_URL",
      "유효하지 않은 이미지 URL입니다.",
      HttpStatus.BAD_REQUEST,
      { retryable: false },
    );
    extractFromUrl.mockRejectedValue(error);

    await expect(controller.process(TASK)).resolves.toBeUndefined();
    expect(save).not.toHaveBeenCalled();
  });

  it("retryable이 없고 5xx이면 예외를 다시 던진다", async () => {
    const { controller, extractFromUrl } = createController();
    const error = new AppException(
      "AI_EXTRACTION_FAILED",
      "AI 추출에 실패했습니다.",
      HttpStatus.BAD_GATEWAY,
    );
    extractFromUrl.mockRejectedValue(error);

    await expect(controller.process(TASK)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("retryable이 없고 4xx이면 오류를 acknowledge한다", async () => {
    const { controller, extractFromUrl } = createController();
    const error = new AppException(
      "INVALID_INSTAGRAM_URL",
      "Instagram URL이 올바르지 않습니다.",
      HttpStatus.BAD_REQUEST,
    );
    extractFromUrl.mockRejectedValue(error);

    await expect(controller.process(TASK)).resolves.toBeUndefined();
  });
});

describe("PlaceWorkerController 중복 저장 알림", () => {
  it("중복 장소마다 저장 시도 기준 key로 알린다", async () => {
    const { controller, extractFromUrl, save, recordAndNotifyUser } =
      createController();
    extractFromUrl.mockResolvedValue([SUCCESSFUL_MATCH]);
    save.mockResolvedValue(
      saveResult({ persistedPlaces: 1, duplicatedPlaces: [DUPLICATED] }),
    );

    await controller.process(TASK);

    expect(recordAndNotifyUser).toHaveBeenCalledTimes(1);
    expect(recordAndNotifyUser).toHaveBeenCalledWith({
      recipientId: TASK.createdBy,
      type: "PIN_DUPLICATED",
      typeLabel: "이미 저장해둔 곳이에요",
      targetName: "어니언 성수",
      thumbnailUrl: "https://example.com/0.jpg",
      payload: {
        placeId: "44444444-4444-4444-8444-444444444444",
        pinId: "55555555-5555-4555-8555-555555555555",
      },
      key: `PIN_DUPLICATED:${TASK.sourceId}:${ENQUEUED_AT}:44444444-4444-4444-8444-444444444444`,
    });
  });

  it("중복이 없으면 알리지 않는다", async () => {
    const { controller, extractFromUrl, save, recordAndNotifyUser } =
      createController();
    extractFromUrl.mockResolvedValue([SUCCESSFUL_MATCH]);
    save.mockResolvedValue(saveResult({ persistedPlaces: 1 }));

    await controller.process(TASK);

    expect(recordAndNotifyUser).not.toHaveBeenCalled();
  });

  it("재시도로 넘어가기 전에 알린다", async () => {
    const { controller, extractFromUrl, save, recordAndNotifyUser } =
      createController();
    extractFromUrl.mockResolvedValue([SUCCESSFUL_MATCH]);
    save.mockResolvedValue(
      saveResult({
        retryableFailures: 1,
        persistedPlaces: 1,
        duplicatedPlaces: [DUPLICATED],
      }),
    );

    await expect(controller.process(TASK)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(recordAndNotifyUser).toHaveBeenCalledTimes(1);
  });
});

describe("PlaceWorkerController 저장 실패 알림", () => {
  const SAVE_FAILED = {
    recipientId: TASK.createdBy,
    type: "SAVE_FAILED",
    typeLabel: "장소를 저장하지 못했어요.",
    targetName: "잠시 후 다시 시도해주세요",
    key: `SAVE_FAILED:${TASK.sourceId}:${ENQUEUED_AT}`,
  };

  it("영구 실패는 첫 시도에서 바로 알린다", async () => {
    const { controller, extractFromUrl, recordAndNotifyUser } =
      createController();
    extractFromUrl.mockRejectedValue(
      new AppException(
        "INVALID_INSTAGRAM_URL",
        "Instagram URL이 올바르지 않습니다.",
        HttpStatus.BAD_REQUEST,
      ),
    );

    await expect(controller.process(TASK)).resolves.toBeUndefined();
    expect(recordAndNotifyUser).toHaveBeenCalledWith(SAVE_FAILED);
  });

  it("인식된 장소가 없으면 알린다", async () => {
    const { controller, extractFromUrl, recordAndNotifyUser } =
      createController();
    extractFromUrl.mockResolvedValue([{ ...SUCCESSFUL_MATCH, matches: [] }]);

    await controller.process(TASK);

    expect(recordAndNotifyUser).toHaveBeenCalledWith(SAVE_FAILED);
  });

  const retryable = new AppException(
    "AI_EXTRACTION_FAILED",
    "AI 추출에 실패했습니다.",
    HttpStatus.BAD_GATEWAY,
  );

  it("재시도가 남아 있으면 알리지 않는다", async () => {
    const { controller, extractFromUrl, recordAndNotifyUser } =
      createController();
    extractFromUrl.mockRejectedValue(retryable);

    await expect(controller.process(TASK, "0")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(recordAndNotifyUser).not.toHaveBeenCalled();
  });

  it("마지막 배달이면 알린다", async () => {
    const { controller, extractFromUrl, recordAndNotifyUser } =
      createController();
    extractFromUrl.mockRejectedValue(retryable);

    await expect(
      controller.process(TASK, String(MAX_ATTEMPTS - 1)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(recordAndNotifyUser).toHaveBeenCalledWith(SAVE_FAILED);
  });
});
