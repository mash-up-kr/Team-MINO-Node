import { afterAll, beforeAll, describe, expect, it, jest } from "bun:test";
import {
  Controller,
  Get,
  HttpCode,
  type INestApplication,
  Logger,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { LoggingMiddleware } from "../src/common/middlewares/logging.middleware";

const loggedStatus: Record<string, number> = {};

@Controller()
class StatusController {
  @Get("/ok")
  @HttpCode(200)
  ok() {
    return { ok: true };
  }

  @Get("/created")
  @HttpCode(201)
  created() {
    return { created: true };
  }

  @Get("/nocontent")
  @HttpCode(204)
  nocontent() {
    return undefined;
  }
}

@Module({ controllers: [StatusController] })
class StatusModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggingMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  jest.spyOn(Logger.prototype, "log").mockImplementation((entry: unknown) => {
    if (
      entry &&
      typeof entry === "object" &&
      "path" in entry &&
      "status" in entry
    ) {
      const { path, status } = entry as { path: string; status: number };
      loggedStatus[path] = status;
    }
  });

  app = await NestFactory.create(StatusModule, new BunHonoAdapter(), {
    bufferLogs: true,
    logger: false,
  });
  await app.listen(0);
  const { port } = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
  jest.restoreAllMocks();
});

async function hit(path: string): Promise<number> {
  const response = await fetch(`${baseUrl}${path}`);
  await response.text();
  return response.status;
}

describe("LoggingMiddleware HTTP status", () => {
  it.each([
    "/ok",
    "/created",
    "/nocontent",
  ])("%s의 실제 응답 status를 기록한다", async (path) => {
    const status = await hit(path);
    expect(loggedStatus[path]).toBe(status);
  });
});
