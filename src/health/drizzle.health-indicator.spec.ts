import "reflect-metadata";
import { beforeEach, describe, expect, it, jest } from "bun:test";
import { Logger } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import { Test } from "@nestjs/testing";
import { DatabaseService } from "../infrastructures/db/database.service";
import { DrizzleHealthIndicator } from "./drizzle.health-indicator";

describe("DrizzleHealthIndicator", () => {
  let indicator: DrizzleHealthIndicator;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DrizzleHealthIndicator,
        HealthIndicatorService,
        {
          provide: DatabaseService,
          useValue: {
            db: { execute: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();

    indicator = module.get(DrizzleHealthIndicator);
  });

  it("DI 정상 동작 확인", async () => {
    expect(indicator).toBeDefined();
  });

  it("DB 정상일 때 status: up 반환", async () => {
    const result = await indicator.pingCheck("database");
    expect(result.database.status).toBe("up");
  });

  it("DB 실패할 때 status: down 반환", async () => {
    const module = await Test.createTestingModule({
      providers: [
        DrizzleHealthIndicator,
        HealthIndicatorService,
        {
          provide: DatabaseService,
          useValue: {
            db: {
              execute: jest
                .fn()
                .mockRejectedValue(new Error("connection refused")),
            },
          },
        },
      ],
    }).compile();

    const failIndicator = module.get(DrizzleHealthIndicator);
    const result = await failIndicator.pingCheck("database");
    expect(result.database.status).toBe("down");
  });

  it("DB 실패 원인을 로그로 남긴다", async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    const cause = new Error("connection refused");

    const module = await Test.createTestingModule({
      providers: [
        DrizzleHealthIndicator,
        HealthIndicatorService,
        {
          provide: DatabaseService,
          useValue: { db: { execute: jest.fn().mockRejectedValue(cause) } },
        },
      ],
    }).compile();

    await module.get(DrizzleHealthIndicator).pingCheck("database");

    expect(errorSpy).toHaveBeenCalledWith({ err: cause }, "DB ping 실패");
    errorSpy.mockRestore();
  });
});
