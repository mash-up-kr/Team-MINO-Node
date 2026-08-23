import "reflect-metadata";
import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { AppException } from "../../common/exceptions/app.exception";
import { TasksService } from "../../infrastructures/tasks/tasks.service";
import { SourceRepository } from "../source/source.repository";
import { PinRepository } from "./pin.repository";
import { PinService } from "./pin.service";

describe("PinService.enqueueRoomPin", () => {
  it("source 저장 결과가 없으면 SOURCE_UPSERT_FAILED를 던지고 enqueue하지 않는다", async () => {
    // given
    const pinRepository = {
      isActiveMemberOfRoom: jest.fn(async () => true),
    };
    const sourceRepository = {
      ensureActiveInstagramSource: jest.fn(async () => undefined),
    };
    const tasksService = {
      enqueuePinExtraction: jest.fn(async () => undefined),
    };
    const module = await Test.createTestingModule({
      providers: [
        PinService,
        { provide: PinRepository, useValue: pinRepository },
        { provide: SourceRepository, useValue: sourceRepository },
        { provide: TasksService, useValue: tasksService },
      ],
    }).compile();
    const service = module.get(PinService);

    // when
    const promise = service.enqueueRoomPin("user-id", "room-id", {
      url: "https://instagram.com/p/abc123/",
    });

    // then
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "SOURCE_UPSERT_FAILED",
    });
    expect(tasksService.enqueuePinExtraction).not.toHaveBeenCalled();
  });
});
