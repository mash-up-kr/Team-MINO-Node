import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type INestApplication, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { ResponseInterceptor } from "../src/common/interceptors/response.interceptor";
import { PlaceModule } from "../src/modules/place/place.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PlaceModule,
  ],
})
class PlaceTestModule {}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const adapter = new BunHonoAdapter();
  app = await NestFactory.create(PlaceTestModule, adapter, {
    bufferLogs: true,
    logger: false,
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(0);
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/v1/place/places (e2e)", () => {
  it("유효한 body는 stub 'Not implemented'로 인해 500을 반환한다", async () => {
    // given
    const requestBody = {
      method: "instagram_url",
      data: { url: "https://www.instagram.com/p/abc123/" },
    };

    // when
    const res = await fetch(`${baseUrl}/api/v1/place/places`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    // then
    expect(res.status).toBe(500);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("INTERNAL_SERVER_ERROR");
  });

  it("유효하지 않은 body는 400 VALIDATION_ERROR를 반환한다", async () => {
    // given
    const requestBody = {
      method: "unknown_method",
      data: { url: "not-a-url" },
    };

    // when
    const res = await fetch(`${baseUrl}/api/v1/place/places`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    // then
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("VALIDATION_ERROR");
  });
});
