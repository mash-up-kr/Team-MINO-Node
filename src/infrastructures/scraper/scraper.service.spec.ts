import { describe, expect, it, jest } from "bun:test";
import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { ScraperService } from "./scraper.service";
import type { InstagramProvider, ScrapedPost } from "./scraper.type";

const URL = "https://www.instagram.com/p/abc123/";
const POST = { shortcode: "abc123" } as ScrapedPost;

function stub(
  name: InstagramProvider["name"],
  result: ScrapedPost | null | AppException,
) {
  const fetch = jest.fn(async () => {
    if (result instanceof AppException) throw result;
    return result;
  });
  return { name, fetch } as unknown as InstagramProvider & {
    fetch: ReturnType<typeof jest.fn>;
  };
}

function createService(...providers: InstagramProvider[]) {
  return new ScraperService(providers);
}

describe("ScraperService", () => {
  it("1순위가 성공하면 뒤 경로는 호출하지 않는다", async () => {
    const first = stub("polaris-json", POST);
    const second = stub("polaris-html", POST);

    const result = await createService(first, second).fetchPost(URL);

    expect(result).toBe(POST);
    expect(first.fetch).toHaveBeenCalledWith("abc123");
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it("null을 돌리면 다음 경로로 넘어간다", async () => {
    const first = stub("polaris-json", null);
    const second = stub("polaris-html", null);
    const third = stub("embed", POST);

    const result = await createService(first, second, third).fetchPost(URL);

    expect(result).toBe(POST);
    expect(second.fetch).toHaveBeenCalled();
    expect(third.fetch).toHaveBeenCalled();
  });

  it("provider가 던진 예외는 그대로 전파하고 뒤 경로를 시도하지 않는다", async () => {
    const notFound = new AppException(
      "POST_NOT_FOUND",
      "없음",
      HttpStatus.NOT_FOUND,
    );
    const first = stub("polaris-json", notFound);
    const second = stub("polaris-html", POST);

    const promise = createService(first, second).fetchPost(URL);

    await expect(promise).rejects.toBe(notFound);
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it("모든 경로가 실패하면 SCRAPER_REQUEST_FAILED로 끝낸다", async () => {
    const service = createService(
      stub("polaris-json", null),
      stub("polaris-html", null),
      stub("embed", null),
    );

    const promise = service.fetchPost(URL);

    await expect(promise).rejects.toMatchObject({
      errorCode: "SCRAPER_REQUEST_FAILED",
    });
  });

  it("인스타 URL이 아니면 경로를 타지 않고 거부한다", async () => {
    const only = stub("polaris-json", POST);

    const promise = createService(only).fetchPost(
      "https://evil.test/p/abc123/",
    );

    await expect(promise).rejects.toMatchObject({
      errorCode: "INVALID_INSTAGRAM_URL",
    });
    expect(only.fetch).not.toHaveBeenCalled();
  });
});
