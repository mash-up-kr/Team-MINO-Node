import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";

// 인스타 경로(/p, /reel, /reels, /tv)에서 shortcode 추출. shortcode는 대소문자를 구분한다.
// 이 정규식은 이 파일에만 존재해야 한다(호스트 검증·파싱의 단일 경계).
const SHORTCODE_PATH_REGEX = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

/**
 * 인스타그램 게시글 URL을 검증하고 shortcode(게시글 식별자)를 추출하는 순수 함수.
 *
 * 네트워크 호출이 전혀 없으므로 스크래퍼 fetch 경로와 enqueue 요청 검증이 동일한 식별
 * 규칙을 공유할 수 있다. 지원하지 않는 호스트/경로/형식은 400 `INVALID_INSTAGRAM_URL`로
 * 실패시킨다.
 */
export function extractInstagramShortcode(url: string): string {
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

  const match = parsed.pathname.match(SHORTCODE_PATH_REGEX);
  if (!match) {
    throw invalidInstagramUrl();
  }
  return match[1];
}

function invalidInstagramUrl(): AppException {
  return new AppException(
    "INVALID_INSTAGRAM_URL",
    "지원하지 않는 인스타그램 URL 입니다.",
    HttpStatus.BAD_REQUEST,
  );
}
