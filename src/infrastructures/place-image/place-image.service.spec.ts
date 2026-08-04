import "reflect-metadata";
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
  mock,
} from "bun:test";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";

const save = jest.fn();
const exists = jest.fn();
const getMetadata = jest.fn();
const file = jest.fn(() => ({ exists, getMetadata, save }));

mock.module("@google-cloud/storage", () => ({
  Storage: class {
    bucket() {
      return { file };
    }
  },
}));

let PlaceImageService: typeof import("./place-image.service").PlaceImageService;
beforeAll(async () => {
  ({ PlaceImageService } = await import("./place-image.service"));
});

const CDN = "https://scontent.cdninstagram.com";
const originalFetch = globalThis.fetch;

function makeService() {
  const config = {
    getOrThrow: () => "test-project",
    get: () => undefined,
  } as unknown as ConfigService<Env>;
  return new PlaceImageService(config);
}

function mockFetch(
  status: number,
  contentType: string,
  bytes = new Uint8Array([1, 2, 3]),
) {
  globalThis.fetch = jest.fn(
    async () =>
      new Response(status === 200 ? bytes : null, {
        status,
        headers: { "content-type": contentType },
      }),
  ) as unknown as typeof fetch;
}

describe("PlaceImageService", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    save.mockReset();
    exists.mockReset();
    getMetadata.mockReset();
  });

  it("허용되지 않은 호스트는 다운로드 없이 스킵한다", async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await makeService().storePostImages("abc123", [
      "https://evil.example/a.jpg",
      "http://scontent.cdninstagram.com/a.jpg", // https 아님
    ]);

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("지원하지 않는 이미지 타입은 스킵한다", async () => {
    exists.mockResolvedValue([false]);
    mockFetch(200, "image/gif");

    const result = await makeService().storePostImages("abc123", [
      `${CDN}/a.jpg`,
    ]);

    expect(result).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it("다운로드 실패(non-2xx)는 스킵한다", async () => {
    exists.mockResolvedValue([false]);
    mockFetch(403, "image/jpeg");

    const result = await makeService().storePostImages("abc123", [
      `${CDN}/a.jpg`,
    ]);

    expect(result).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it("허용 호스트 + 지원 타입은 업로드하고 gs:// URI를 반환한다", async () => {
    exists.mockResolvedValue([false]);
    save.mockResolvedValue(undefined);
    mockFetch(200, "image/jpeg");

    const result = await makeService().storePostImages("abc123", [
      `${CDN}/a.jpg`,
    ]);

    expect(result).toEqual([
      {
        gsUri: "gs://team-mino-place-images-local/instagram/abc123/000",
        mediaType: "image/jpeg",
      },
    ]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("인덱스를 고정 자릿수로 채워 사전순과 숫자순을 일치시킨다", async () => {
    exists.mockResolvedValue([false]);
    save.mockResolvedValue(undefined);
    mockFetch(200, "image/jpeg");

    const result = await makeService().storePostImages(
      "abc123",
      Array.from({ length: 11 }, () => `${CDN}/a.jpg`),
    );

    const indexes = result.map((image) => image.gsUri.split("/").pop());
    expect(indexes).toEqual([...indexes].sort());
    expect(indexes[0]).toBe("000");
    expect(indexes[10]).toBe("010");
  });

  it("이미 존재하면 재다운로드 없이 저장된 타입으로 재사용한다", async () => {
    exists.mockResolvedValue([true]);
    getMetadata.mockResolvedValue([{ contentType: "image/png" }]);
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await makeService().storePostImages("abc123", [
      `${CDN}/a.jpg`,
    ]);

    expect(result).toEqual([
      {
        gsUri: "gs://team-mino-place-images-local/instagram/abc123/000",
        mediaType: "image/png",
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
