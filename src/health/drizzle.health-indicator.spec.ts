import "reflect-metadata";
import { beforeEach, describe, expect, it, jest } from "bun:test";
import { Test } from "@nestjs/testing";
import { HealthIndicatorService } from "@nestjs/terminus";
import { DatabaseService } from "../database/database.service";
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
    expect(result["database"].status).toBe("up");
  });

  it("DB 실패할 때 status: down 반환", async () => {
    const module = await Test.createTestingModule({
      providers: [
        DrizzleHealthIndicator,
        HealthIndicatorService,
        {
          provide: DatabaseService,
          useValue: {
            db: { execute: jest.fn().mockRejectedValue(new Error("connection refused")) },
          },
        },
      ],
    }).compile();

    const failIndicator = module.get(DrizzleHealthIndicator);
    const result = await failIndicator.pingCheck("database");
    expect(result["database"].status).toBe("down");
  });
});
