import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    Test.createTestingModule({ imports: [AppModule] }),
  ));
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("실제 PostgreSQL 연결 상태를 반환한다", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        status: string;
        info?: { database?: { status?: string } };
        details?: { database?: { status?: string } };
      };
    };
    expect(body.data.status).toBe("ok");
    expect(body.data.info?.database?.status).toBe("up");
    expect(body.data.details?.database?.status).toBe("up");
  });
});
