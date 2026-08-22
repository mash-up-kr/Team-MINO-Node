import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";

// 인스타 경로(/p, /reel, /reels, /tv)에서 shortcode 추출. 저장·큐 전달용 URL을 만드는
// 목적으로 스크래퍼 모듈(instagram.util.ts)과는 별도로 둔다 — 스크래퍼 쪽 shortcode
// 추출 규칙을 이 모듈 사정으로 바꾸지 않기 위함.
const SHORTCODE_PATH_REGEX = /^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/;

/**
 * 검증된 인스타그램 링크를 저장·큐 전달용 단일 표현으로 만든다.
 * 입력이 HTTP여도 안전한 HTTPS deep link로 올리고, 자격증명·비표준 포트·추적값은 버린다.
 */
export function normalizeInstagramUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalidInstagramUrl();
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "instagram.com" && !host.endsWith(".instagram.com")) {
    throw invalidInstagramUrl();
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== ""
  ) {
    throw invalidInstagramUrl();
  }

  const match = parsed.pathname.match(SHORTCODE_PATH_REGEX);
  const route = match?.[1];
  const shortcode = match?.[2];
  if (
    (route !== "p" &&
      route !== "reel" &&
      route !== "reels" &&
      route !== "tv") ||
    shortcode === undefined
  ) {
    throw invalidInstagramUrl();
  }
  return `https://instagram.com/${route}/${shortcode}/`;
}

export function isInstagramUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    normalizeInstagramUrl(value);
    return true;
  } catch (error) {
    if (error instanceof AppException) return false;
    throw error;
  }
}

function invalidInstagramUrl(): AppException {
  return new AppException(
    "INVALID_INSTAGRAM_URL",
    "지원하지 않는 인스타그램 URL 입니다.",
    HttpStatus.BAD_REQUEST,
  );
}
