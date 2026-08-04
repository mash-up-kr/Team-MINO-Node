import { describe, expect, it, jest } from "bun:test";
import { HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { PlaceService } from "./place.service";
import type { PlaceResultRepository } from "./place-result.repository";
import { PlaceWorkerController } from "./place-worker.controller";

const URL = "https://www.instagram.com/p/abc123/";

function createController() {
  const extractFromUrl = jest.fn();
  const save = jest.fn();
  const placeService = { extractFromUrl } as unknown as PlaceService;
  const placeResultRepository = { save } as unknown as PlaceResultRepository;

  return {
    controller: new PlaceWorkerController(placeService, placeResultRepository),
    extractFromUrl,
    save,
  };
}

describe("PlaceWorkerController retry policy", () => {
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
      .process({ url: URL })
      .catch((error_) => error_);

    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    const exception = thrown as ServiceUnavailableException;
    expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(exception.getResponse()).toMatchObject({
      errorCode: "AI_SCHEMA_MISMATCH",
    });
    expect((exception as unknown as { cause?: unknown }).cause).toBe(error);
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

    await expect(controller.process({ url: URL })).rejects.toBe(error);
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

    await expect(controller.process({ url: URL })).resolves.toBeUndefined();
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

    await expect(controller.process({ url: URL })).rejects.toBe(error);
  });

  it("retryable이 없고 4xx이면 오류를 acknowledge한다", async () => {
    const { controller, extractFromUrl } = createController();
    const error = new AppException(
      "INVALID_INSTAGRAM_URL",
      "Instagram URL이 올바르지 않습니다.",
      HttpStatus.BAD_REQUEST,
    );
    extractFromUrl.mockRejectedValue(error);

    await expect(controller.process({ url: URL })).resolves.toBeUndefined();
  });
});
