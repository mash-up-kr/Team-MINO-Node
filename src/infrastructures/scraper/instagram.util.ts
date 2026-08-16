import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";

// 인스타 경로(/p, /reel, /reels, /tv)에서 shortcode 추출. shortcode는 대소문자를 구분한다.
// 이 정규식은 이 파일에만 존재해야 한다(호스트 검증·파싱의 단일 경계).
const SHORTCODE_PATH_REGEX = /^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/;

type InstagramUrlParts = {
  readonly route: "p" | "reel" | "reels" | "tv";
  readonly shortcode: string;
};

/**
 * 인스타그램 게시글 URL을 검증하고 shortcode(게시글 식별자)를 추출하는 순수 함수.
 *
 * 네트워크 호출이 전혀 없으므로 스크래퍼 fetch 경로와 enqueue 요청 검증이 동일한 식별
 * 규칙을 공유할 수 있다. 지원하지 않는 호스트/경로/형식은 400 `INVALID_INSTAGRAM_URL`로
 * 실패시킨다.
 */
export function extractInstagramShortcode(url: string): string {
  return parseInstagramUrl(url).shortcode;
}

/**
 * 검증된 인스타그램 링크를 저장·큐 전달용 단일 표현으로 만든다.
 * 입력이 HTTP여도 안전한 HTTPS deep link로 올리고, 자격증명·비표준 포트·추적값은 버린다.
 */
export function normalizeInstagramUrl(url: string): string {
  const { route, shortcode } = parseInstagramUrl(url);
  return `https://instagram.com/${route}/${shortcode}/`;
}

function parseInstagramUrl(url: string): InstagramUrlParts {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalidInstagramUrl();
  }

  // 호스트가 instagram.com (또는 서브도메인)인지 먼저 확인 — 문자열 포함 검사로 인한
  // 타 도메인 우회(SSRF) 방지. 예: evil.com/?x=instagram.com/p/id 는 거부.
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
  return { route, shortcode };
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
