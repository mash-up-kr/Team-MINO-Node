import { HttpStatus, Logger } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { ScrapedPost } from "./scraper.type";

export const INSTAGRAM_ORIGIN = "https://www.instagram.com";

const logger = new Logger("InstagramRequest");

/**
 * 세 경로가 공유하는 인스타 요청. 네트워크·타임아웃·비 2xx·본문 읽기 실패를 모두
 * `null`로 합쳐, 호출한 provider가 다음 경로로 넘길지만 판단하게 한다.
 *
 * User-Agent 규칙(실측): 브라우저를 주장하면 인스타가 TLS 지문 불일치를 감지해 데이터
 * 없는 로그인 셸만 주고, 빈 문자열도 거부당한다. 그 밖의 값은 전부 통과한다.
 * 서비스명을 드러내면 정확히 일치 한 줄로 차단당하므로 흔한 HTTP 클라이언트 값을 쓴다.
 */
export async function fetchInstagram(
  path: string,
  init?: RequestInit,
): Promise<string | null> {
  const url = `${INSTAGRAM_ORIGIN}${path}`;
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init?.headers)),
        "user-agent": "okhttp/4.12.0",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.warn({ url, status: response.status }, "인스타 응답 오류");
      return null;
    }
    // 헤더는 받았어도 본문 스트리밍 중 끊기면 여기서 reject된다.
    return await response.text();
  } catch (error) {
    logger.warn({ err: error, url }, "인스타 요청 실패");
    return null;
  }
}

/**
 * 인스타 응답의 `__typename`을 도메인 타입으로 좁힌다. 같은 타입을 두 어휘로 부른다 —
 * 임베드는 `GraphSidecar`, Polaris는 `XIGPolarisCarouselMedia`.
 *
 * 미지원 타입을 조용히 image로 삼키면 잘못된 데이터가 AI 단계로 흘러가므로 null을 준다.
 */
export function toScrapedTypename(
  rawTypename: string,
): ScrapedPost["typename"] | null {
  if (rawTypename.includes("Sidecar") || rawTypename.includes("Carousel")) {
    return "carousel";
  }
  if (rawTypename.includes("Video")) return "video";
  if (rawTypename.includes("Image")) return "image";
  return null;
}

/** shortcode → GraphQL이 요구하는 media_id. 안전 정수를 넘으므로 BigInt로 누산한다. */
export function shortcodeToMediaId(shortcode: string): string {
  // shortcode는 이 알파벳을 자릿수로 쓰는 64진수다.
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  let value = 0n;
  for (const char of shortcode) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw invalidInstagramUrl();
    value = value * 64n + BigInt(digit);
  }
  return value.toString();
}

/**
 * 인스타그램 게시글 URL을 검증하고 shortcode를 추출하는 순수 함수.
 *
 * 네트워크 호출이 없으므로 스크래퍼와 enqueue 요청 검증이 같은 식별 규칙을 공유한다.
 * 호스트 검증·경로 파싱은 이 함수에만 존재해야 한다.
 */
export function extractInstagramShortcode(url: string): string {
  const parsed = URL.parse(url);
  if (!parsed) throw invalidInstagramUrl();

  // 문자열 포함 검사로 인한 타 도메인 우회(SSRF) 방지.
  // 예: evil.com/?x=instagram.com/p/id 는 거부해야 한다.
  const host = parsed.hostname.toLowerCase();
  if (host !== "instagram.com" && !host.endsWith(".instagram.com")) {
    throw invalidInstagramUrl();
  }

  const shortcode = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(
    parsed.pathname,
  )?.[1];
  if (!shortcode) throw invalidInstagramUrl();
  return shortcode;
}

function invalidInstagramUrl(): AppException {
  return new AppException(
    "INVALID_INSTAGRAM_URL",
    "지원하지 않는 인스타그램 URL 입니다.",
    HttpStatus.BAD_REQUEST,
  );
}
