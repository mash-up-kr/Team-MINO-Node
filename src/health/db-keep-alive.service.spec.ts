import "reflect-metadata";
import { afterEach, describe, expect, it, jest } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DbKeepAliveService } from "./db-keep-alive.service";

const URL = "https://example.test/keep-alive";
const API_KEY = "test-api-key";

async function createService(env: Record<string, string | undefined>) {
  const module = await Test.createTestingModule({
    providers: [
      DbKeepAliveService,
      {
        provide: ConfigService,
        useValue: { get: (key: string) => env[key] },
      },
    ],
  }).compile();

  return module.get(DbKeepAliveService);
}

describe("DbKeepAliveService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("설정이 있으면 apikey 헤더를 실어 호출하고 true 반환", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const service = await createService({
      SUPABASE_KEEP_ALIVE_URL: URL,
      SUPABASE_API_KEY: API_KEY,
    });

    expect(await service.ping()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(URL);
    expect((init?.headers as Record<string, string>).apikey).toBe(API_KEY);
  });

  it("설정이 없으면 호출하지 않고 false 반환", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");

    const service = await createService({});

    expect(await service.ping()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("응답이 실패 상태면 false 반환", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));

    const service = await createService({
      SUPABASE_KEEP_ALIVE_URL: URL,
      SUPABASE_API_KEY: API_KEY,
    });

    expect(await service.ping()).toBe(false);
  });

  it("요청이 예외를 던지면 false 반환", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network unreachable"));

    const service = await createService({
      SUPABASE_KEEP_ALIVE_URL: URL,
      SUPABASE_API_KEY: API_KEY,
    });

    expect(await service.ping()).toBe(false);
  });
});
