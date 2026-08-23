import { describe, expect, it } from "bun:test";
import { AppException } from "../exceptions/app.exception";
import { isInstagramUrl, normalizeInstagramUrl } from "./instagram-url.dto";

describe("normalizeInstagramUrl", () => {
  it.each([
    [
      "tracking query/hash",
      "https://www.instagram.com/p/AbC_1-2/?igsh=one#fragment",
      "https://instagram.com/p/AbC_1-2/",
    ],
    [
      "http input",
      "http://m.instagram.com/reel/xyz-9?utm_source=test",
      "https://instagram.com/reel/xyz-9/",
    ],
  ])("%s URL을 canonical deep link로 정규화한다", (_label, url, expected) => {
    expect(normalizeInstagramUrl(url)).toBe(expected);
  });

  it.each([
    ["인스타가 아닌 호스트", "https://example.com/p/abc123"],
    [
      "경로에 instagram.com 문자열이 섞인 타 도메인",
      "https://evil.com/?x=instagram.com/p/abc123",
    ],
    ["URL 형식이 아닌 값", "not-a-url"],
    ["shortcode 없는 프로필 URL", "https://www.instagram.com/some_user/"],
    ["경로가 없는 홈 URL", "https://www.instagram.com/"],
    ["자격증명이 포함된 URL", "https://user:pass@instagram.com/p/abc123/"],
    ["비표준 포트가 포함된 URL", "https://instagram.com:8443/p/abc123/"],
    ["지원하지 않는 프로토콜", "ftp://instagram.com/p/abc123/"],
  ])("지원하지 않는 URL(%s)은 INVALID_INSTAGRAM_URL 400을 던진다", (_label, url) => {
    try {
      normalizeInstagramUrl(url);
      throw new Error("should have thrown");
    } catch (error) {
      if (!(error instanceof AppException)) throw error;
      expect(error).toMatchObject({ errorCode: "INVALID_INSTAGRAM_URL" });
      expect(error.getStatus()).toBe(400);
    }
  });
});

describe("isInstagramUrl", () => {
  it("유효한 인스타그램 URL은 true를 반환한다", () => {
    expect(isInstagramUrl("https://www.instagram.com/p/abc123/")).toBe(true);
  });

  it("유효하지 않은 값은 예외 없이 false를 반환한다", () => {
    expect(isInstagramUrl("not-a-url")).toBe(false);
    expect(isInstagramUrl(123)).toBe(false);
  });
});
