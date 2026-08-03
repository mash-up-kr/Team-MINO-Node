import { describe, expect, it, jest } from "bun:test";
import { HttpStatus } from "@nestjs/common";
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
  it("retryable=true이면 예외를 다시 던져 Cloud Tasks 재시도를 유도한다", async () => {
    const { controller, extractFromUrl, save } = createController();
    const error = new AppException(
      "AI_SCHEMA_MISMATCH",
      "AI 응답이 스키마와 일치하지 않습니다.",
      HttpStatus.UNPROCESSABLE_ENTITY,
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
