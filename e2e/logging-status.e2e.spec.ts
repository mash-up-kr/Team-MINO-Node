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

// path -> status the LoggingMiddleware logged (after the response was built)
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
  // Capture the status the middleware logs.
  jest.spyOn(Logger.prototype, "log").mockImplementation((entry: unknown) => {
    if (
      entry &&
      typeof entry === "object" &&
      "path" in entry &&
      "status" in entry
    ) {
      const e = entry as { path: string; status: number };
      loggedStatus[e.path] = e.status;
    }
  });

  const adapter = new BunHonoAdapter();
  app = await NestFactory.create(StatusModule, adapter, {
    bufferLogs: true,
    logger: false,
  });

  await app.listen(0);
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
});

// Hits the endpoint, returns the real HTTP status code.
async function hit(path: string): Promise<number> {
  const res = await fetch(`${baseUrl}${path}`);
  await res.text();
  return res.status;
}

function loggedFor(path: string): number | undefined {
  return loggedStatus[path];
}

describe("LoggingMiddleware status accuracy", () => {
  it("200 OK", async () => {
    const actual = await hit("/ok");
    console.log(`/ok        HTTP=${actual}  logged=${loggedFor("/ok")}`);
    expect(loggedFor("/ok")).toBe(actual);
  });

  it("201 Created", async () => {
    const actual = await hit("/created");
    console.log(`/created   HTTP=${actual}  logged=${loggedFor("/created")}`);
    expect(loggedFor("/created")).toBe(actual);
  });

  it("204 No Content", async () => {
    const actual = await hit("/nocontent");
    console.log(`/nocontent HTTP=${actual}  logged=${loggedFor("/nocontent")}`);
    expect(loggedFor("/nocontent")).toBe(actual);
  });
});
