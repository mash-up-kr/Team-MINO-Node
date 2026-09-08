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
import type { SentryErrorReporter } from "../sentry/sentry-reporter";

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

const report = jest.fn();

function makeService() {
  const config = {
    getOrThrow: () => "test-project",
    get: () => undefined,
  } as unknown as ConfigService<Env>;
  const reporter = { report } as unknown as SentryErrorReporter;
  return new PlaceImageService(config, reporter);
}

function mockFetch(
  status: number,
  contentType: string,
  bytes = new Uint8Array([1, 2, 3]),
) {
  const spy = jest.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(status === 200 ? bytes : null, {
        status,
        headers: { "content-type": contentType },
      }),
  );
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

describe("PlaceImageService", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    save.mockReset();
    exists.mockReset();
    getMetadata.mockReset();
    report.mockReset();
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

  it("허용되지 않은 호스트는 게시글당 한 번만 리포트한다", async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;

    await makeService().storePostImages("abc123", [
      "https://evil.example/a.jpg?token=secret",
      "https://evil.example/b.jpg",
      "https://other.example/c.jpg",
    ]);

    expect(report).toHaveBeenCalledTimes(1);
    const [error, context] = report.mock.calls[0];
    // 메시지가 고정이라 호스트가 바뀌어도 Sentry에서 한 이슈로 묶인다.
    expect(error.message).toBe("허용되지 않은 이미지 호스트");
    expect(context.errorCode).toBe("IMAGE_HOST_NOT_ALLOWED");
    // 서명 URL의 토큰이 새지 않도록 호스트만 싣는다.
    expect(context.extra).toEqual({
      hosts: ["evil.example", "other.example"],
      disallowed: 3,
      total: 3,
    });
  });

  it("허용된 호스트만 있으면 리포트하지 않는다", async () => {
    exists.mockResolvedValue([false]);
    save.mockResolvedValue(undefined);
    mockFetch(200, "image/jpeg");

    await makeService().storePostImages("abc123", [`${CDN}/a.jpg`]);

    expect(report).not.toHaveBeenCalled();
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
        publicUrl:
          "https://storage.googleapis.com/team-mino-place-images-local/instagram/abc123/000",
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

  it("리다이렉트를 따라가지 않도록 요청한다", async () => {
    exists.mockResolvedValue([false]);
    save.mockResolvedValue(undefined);
    const fetchSpy = mockFetch(200, "image/jpeg");

    await makeService().storePostImages("abc123", [`${CDN}/a.jpg`]);

    // 허용 호스트가 임의 주소로 리다이렉트하면 allowlist가 무력화된다(SSRF).
    expect(fetchSpy.mock.calls[0][1]?.redirect).toBe("error");
  });

  it("리다이렉트 응답은 다운로드 실패로 스킵한다", async () => {
    exists.mockResolvedValue([false]);
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError("unexpected redirect");
    }) as unknown as typeof fetch;

    const result = await makeService().storePostImages("abc123", [
      `${CDN}/a.jpg`,
    ]);

    expect(result).toEqual([]);
    expect(save).not.toHaveBeenCalled();
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
        publicUrl:
          "https://storage.googleapis.com/team-mino-place-images-local/instagram/abc123/000",
        mediaType: "image/png",
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
