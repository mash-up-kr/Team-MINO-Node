import { afterEach, describe, expect, it } from "bun:test";
import { AppException } from "../../common/exceptions/app.exception";
import { extractInstagramShortcode } from "./instagram.util";

const originalFetch = globalThis.fetch;

describe("extractInstagramShortcode", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it.each([
    ["/p", "https://www.instagram.com/p/abc123/", "abc123"],
    ["/reel", "https://www.instagram.com/reel/abc123/", "abc123"],
    ["/reels", "https://www.instagram.com/reels/abc123/", "abc123"],
    ["/tv", "https://www.instagram.com/tv/abc123/", "abc123"],
  ])("지원 경로 %s에서 shortcode를 추출한다", (_label, url, expected) => {
    expect(extractInstagramShortcode(url)).toBe(expected);
  });

  it("www 없는 apex 호스트도 허용한다", () => {
    expect(extractInstagramShortcode("https://instagram.com/p/abc123/")).toBe(
      "abc123",
    );
  });

  it("허용된 서브도메인(예: m.instagram.com)도 허용한다", () => {
    expect(extractInstagramShortcode("https://m.instagram.com/p/abc123/")).toBe(
      "abc123",
    );
  });

  it("쿼리스트링과 해시가 붙어도 shortcode만 추출한다", () => {
    expect(
      extractInstagramShortcode(
        "https://www.instagram.com/p/abc123/?igsh=xyz#frag",
      ),
    ).toBe("abc123");
  });

  it("shortcode 대소문자를 보존한다", () => {
    expect(
      extractInstagramShortcode("https://www.instagram.com/p/AbC_1-2/"),
    ).toBe("AbC_1-2");
  });

  it.each([
    ["인스타가 아닌 호스트", "https://example.com/p/abc123"],
    [
      "경로에 instagram.com 문자열이 섞인 타 도메인",
      "https://evil.com/?x=instagram.com/p/abc123",
    ],
    [
      "instagram.com을 접미사로 위장한 호스트",
      "https://notinstagram.com/p/abc123",
    ],
    ["URL 형식이 아닌 값", "not-a-url"],
    ["shortcode 없는 프로필 URL", "https://www.instagram.com/some_user/"],
    ["경로가 없는 홈 URL", "https://www.instagram.com/"],
  ])("지원하지 않는 URL(%s)은 INVALID_INSTAGRAM_URL 400을 던진다", (_label, url) => {
    try {
      extractInstagramShortcode(url);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect(error).toMatchObject({ errorCode: "INVALID_INSTAGRAM_URL" });
      expect((error as AppException).getStatus()).toBe(400);
    }
  });

  it("파싱 도중 네트워크 호출(fetch)을 하지 않는다", () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response("");
    }) as unknown as typeof fetch;

    extractInstagramShortcode("https://www.instagram.com/p/abc123/");
    try {
      extractInstagramShortcode("https://evil.com/p/abc123");
    } catch {
      // 무시 — 실패 경로에서도 fetch가 없어야 한다.
    }

    expect(fetchCalls).toBe(0);
  });
});
