import "reflect-metadata";
import { describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { AppException } from "../../common/exceptions/app.exception";
import { TasksService } from "../../infrastructures/tasks/tasks.service";
import { NotificationService } from "../notification/notification.service";
import { RoomRepository } from "../room/room.repository";
import { SourceRepository } from "../source/source.repository";
import { PinRepository } from "./pin.repository";
import { PinService } from "./pin.service";

describe("PinService.enqueueRoomPins", () => {
  it("source 저장 결과가 없으면 SOURCE_UPSERT_FAILED를 던지고 enqueue하지 않는다", async () => {
    // given
    const pinRepository = {
      listTargetRoomsWithMembership: jest.fn(async () => [
        { roomId: "room-id", isMember: true },
      ]),
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
        { provide: RoomRepository, useValue: {} },
        { provide: SourceRepository, useValue: sourceRepository },
        { provide: TasksService, useValue: tasksService },
        {
          provide: NotificationService,
          useValue: { recordAndNotifyUser: jest.fn() },
        },
      ],
    }).compile();
    const service = module.get(PinService);

    // when
    const promise = service.enqueueRoomPins("user-id", {
      url: "https://instagram.com/p/abc123/",
      roomIds: ["room-id"],
    });

    // then
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "SOURCE_UPSERT_FAILED",
    });
    expect(tasksService.enqueuePinExtraction).not.toHaveBeenCalled();
  });

  it("인스타그램 링크가 아니면 저장 실패 알림을 보내고 enqueue하지 않는다", async () => {
    // given
    const pinRepository = {
      listTargetRoomsWithMembership: jest.fn(async () => [
        { roomId: "room-id", isMember: true },
      ]),
    };
    const sourceRepository = {
      ensureActiveInstagramSource: jest.fn(async () => "source-id"),
    };
    const tasksService = {
      enqueuePinExtraction: jest.fn(async () => undefined),
    };
    const notificationService = {
      recordAndNotifyUser: jest.fn(async () => undefined),
    };
    const module = await Test.createTestingModule({
      providers: [
        PinService,
        { provide: PinRepository, useValue: pinRepository },
        { provide: RoomRepository, useValue: {} },
        { provide: SourceRepository, useValue: sourceRepository },
        { provide: TasksService, useValue: tasksService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();
    const service = module.get(PinService);

    // when
    await service.enqueueRoomPins("user-id", {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      roomIds: ["room-id"],
    });

    // then
    expect(notificationService.recordAndNotifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "user-id",
        type: "SAVE_FAILED",
      }),
    );
    expect(tasksService.enqueuePinExtraction).not.toHaveBeenCalled();
    expect(sourceRepository.ensureActiveInstagramSource).not.toHaveBeenCalled();
  });
});

describe("PinService.deletePin", () => {
  it("핀이 존재하고 유저가 방 멤버이면 softDelete를 호출하고 정상 완료된다", async () => {
    // given
    const pinRepository = {
      findActiveByIdForUser: jest.fn(async () => ({
        id: "pin-id",
        roomId: "room-id",
        placeId: "place-id",
        sourceId: null,
        isMember: true,
      })),
      softDelete: jest.fn(async () => true),
    };
    const module = await Test.createTestingModule({
      providers: [
        PinService,
        { provide: PinRepository, useValue: pinRepository },
        { provide: RoomRepository, useValue: {} },
        { provide: SourceRepository, useValue: {} },
        { provide: TasksService, useValue: {} },
        {
          provide: NotificationService,
          useValue: { recordAndNotifyUser: jest.fn() },
        },
      ],
    }).compile();
    const service = module.get(PinService);

    // when
    await service.deletePin("user-id", "pin-id");

    // then
    expect(pinRepository.findActiveByIdForUser).toHaveBeenCalledWith(
      "pin-id",
      "user-id",
    );
    expect(pinRepository.softDelete).toHaveBeenCalledWith("pin-id", "user-id");
  });

  it("핀이 존재하지 않으면 PIN_NOT_FOUND를 던진다", async () => {
    // given
    const pinRepository = {
      findActiveByIdForUser: jest.fn(async () => undefined),
      softDelete: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        PinService,
        { provide: PinRepository, useValue: pinRepository },
        { provide: RoomRepository, useValue: {} },
        { provide: SourceRepository, useValue: {} },
        { provide: TasksService, useValue: {} },
        {
          provide: NotificationService,
          useValue: { recordAndNotifyUser: jest.fn() },
        },
      ],
    }).compile();
    const service = module.get(PinService);

    // when & then
    const promise = service.deletePin("user-id", "pin-id");
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "PIN_NOT_FOUND",
      status: 404,
    });
    expect(pinRepository.softDelete).not.toHaveBeenCalled();
  });

  it("유저가 해당 방의 멤버가 아니면 NOT_ROOM_MEMBER를 던진다", async () => {
    // given
    const pinRepository = {
      findActiveByIdForUser: jest.fn(async () => ({
        id: "pin-id",
        roomId: "room-id",
        placeId: "place-id",
        sourceId: null,
        isMember: false,
      })),
      softDelete: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        PinService,
        { provide: PinRepository, useValue: pinRepository },
        { provide: RoomRepository, useValue: {} },
        { provide: SourceRepository, useValue: {} },
        { provide: TasksService, useValue: {} },
        {
          provide: NotificationService,
          useValue: { recordAndNotifyUser: jest.fn() },
        },
      ],
    }).compile();
    const service = module.get(PinService);

    // when & then
    const promise = service.deletePin("user-id", "pin-id");
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "NOT_ROOM_MEMBER",
      status: 403,
    });
    expect(pinRepository.softDelete).not.toHaveBeenCalled();
  });

  it("softDelete 결과가 false이면 PIN_NOT_FOUND를 던진다", async () => {
    // given
    const pinRepository = {
      findActiveByIdForUser: jest.fn(async () => ({
        id: "pin-id",
        roomId: "room-id",
        placeId: "place-id",
        sourceId: null,
        isMember: true,
      })),
      softDelete: jest.fn(async () => false),
    };
    const module = await Test.createTestingModule({
      providers: [
        PinService,
        { provide: PinRepository, useValue: pinRepository },
        { provide: RoomRepository, useValue: {} },
        { provide: SourceRepository, useValue: {} },
        { provide: TasksService, useValue: {} },
        {
          provide: NotificationService,
          useValue: { recordAndNotifyUser: jest.fn() },
        },
      ],
    }).compile();
    const service = module.get(PinService);

    // when & then
    const promise = service.deletePin("user-id", "pin-id");
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "PIN_NOT_FOUND",
      status: 404,
    });
  });
});
