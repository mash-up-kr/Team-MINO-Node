import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AppException } from "../../../common/exceptions/app.exception";
import { InstagramProvider } from "./instagram.provider";

const URL = "https://www.instagram.com/p/abc123/";

// 임베드 페이지(https://www.instagram.com/p/{shortcode}/embed/captioned/)의
// 실제 응답 구조를 최소화해 흉내낸 HTML. (& -> &amp;, @ -> &#064; 는 인스타가 실제로 이렇게 인코딩해 준다)
function makeEmbedHtml(
  options: {
    imageUrl?: string | null;
    caption?: string | null;
    username?: string | null;
  } = {},
) {
  const {
    imageUrl = "https://scontent.cdninstagram.com/img.jpg?a=1&amp;b=2",
    caption = '성수동 카페 <a href="/explore/tags/카페/">#카페</a> 좋아요&#064;',
    username = "onion_seongsu",
  } = options;

  const image = imageUrl
    ? `<img class="EmbeddedMediaImage" alt="post" src="${imageUrl}">`
    : "";
  const usernameLink = username
    ? `<a class="CaptionUsername" href="https://www.instagram.com/${username}/">${username}</a>`
    : "";
  // CaptionComments("View all N comments")는 실제로 Caption div 안, 캡션 텍스트
  // 뒤에 중첩되어 있고, 그다음 형제로 Footer div가 온다 — 실제 마크업 순서를 그대로 흉내낸다.
  const captionBlock =
    caption === null
      ? ""
      : `<div class="Caption">${usernameLink}<br /><br />${caption}<div class="CaptionComments"><a>View all 3 comments</a></div></div><div class="Footer"></div>`;

  return `<html><body><article><div class="EmbedContainer">${image}</div>${captionBlock}</article></body></html>`;
}

const originalFetch = globalThis.fetch;

function mockFetch(body: string, status = 200) {
  globalThis.fetch = (async () =>
    new Response(body, {
      status,
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch;
}

function mockFetchCapturingRequest(body: string) {
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as unknown as typeof fetch;
  return () => capturedInit;
}

describe("InstagramProvider", () => {
  let provider: InstagramProvider;

  beforeEach(() => {
    provider = new InstagramProvider();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("게시글을 ScrapedPost로 매핑한다", async () => {
    // given
    mockFetch(makeEmbedHtml());

    // when
    const post = await provider.fetchPost(URL);

    // then
    expect(post.shortcode).toBe("abc123");
    expect(post.typename).toBe("image");
    expect(post.caption).toBe("성수동 카페 #카페 좋아요@");
    expect(post.imageUrls).toEqual([
      "https://scontent.cdninstagram.com/img.jpg?a=1&b=2",
    ]);
    expect(post.owner).toEqual({
      id: "",
      username: "onion_seongsu",
      fullName: "",
    });
    expect(post.location).toBeNull();
  });

  it("브라우저로 위장한 User-Agent를 보내지 않는다 (실제로 보내면 인스타가 콘텐츠 없는 빈 셀만 준다)", async () => {
    // given
    const getCapturedInit = mockFetchCapturingRequest(makeEmbedHtml());

    // when
    await provider.fetchPost(URL);

    // then
    const userAgent = (
      getCapturedInit()?.headers as Record<string, string> | undefined
    )?.["User-Agent"];
    expect(userAgent).toBeDefined();
    expect(userAgent).not.toMatch(/Mozilla|Chrome|Safari/);
  });

  it("16진수 HTML 엔티티를 디코딩한다", async () => {
    // given
    mockFetch(makeEmbedHtml({ caption: "웃긴 사진&#x1F600;" }));

    // when
    const post = await provider.fetchPost(URL);

    // then
    expect(post.caption).toBe("웃긴 사진😀");
  });

  it("유효 범위를 벗어난 숫자 엔티티는 예외 없이 원문 그대로 둔다", async () => {
    // given — String.fromCodePoint는 0x10FFFF를 넘으면 RangeError를 던진다.
    mockFetch(makeEmbedHtml({ caption: "이상한 값&#99999999;끝" }));

    // when
    const post = await provider.fetchPost(URL);

    // then — 던지지 않고, 알 수 없는 엔티티는 원문 그대로 보존한다.
    expect(post.caption).toBe("이상한 값&#99999999;끝");
  });

  it("알 수 없는 명명 엔티티는 원문 그대로 둔다", async () => {
    // given
    mockFetch(makeEmbedHtml({ caption: "생략&hellip;표시" }));

    // when
    const post = await provider.fetchPost(URL);

    // then
    expect(post.caption).toBe("생략&hellip;표시");
  });

  it("캡션이 없으면 null로 매핑한다", async () => {
    // given
    mockFetch(makeEmbedHtml({ caption: null }));

    // when
    const post = await provider.fetchPost(URL);

    // then
    expect(post.caption).toBeNull();
  });

  it("reel/reels URL에서도 shortcode를 추출한다", async () => {
    // given
    mockFetch(makeEmbedHtml());

    // when
    const post = await provider.fetchPost(
      "https://www.instagram.com/reel/abc123/",
    );

    // then
    expect(post.shortcode).toBe("abc123");
  });

  it.each([
    ["인스타가 아닌 호스트", "https://example.com/not-instagram"],
    [
      "경로에 instagram.com 문자열이 섞인 타 도메인",
      "https://evil.com/?x=instagram.com/p/abc123",
    ],
    ["URL 형식이 아닌 값", "not-a-url"],
  ])("지원하지 않는 URL(%s)은 INVALID_INSTAGRAM_URL을 던진다", async (_label, url) => {
    // when
    const call = provider.fetchPost(url);

    // then
    await expect(call).rejects.toBeInstanceOf(AppException);
    await expect(call).rejects.toMatchObject({
      errorCode: "INVALID_INSTAGRAM_URL",
    });
  });

  it("대표 이미지가 없으면(삭제/비공개) POST_NOT_FOUND를 던진다", async () => {
    // given — 게시물이 없거나 비공개면 임베드 페이지에 대표 이미지가 렌더링되지 않는다.
    mockFetch(makeEmbedHtml({ imageUrl: null }));

    // when
    const call = provider.fetchPost(URL);

    // then
    await expect(call).rejects.toMatchObject({ errorCode: "POST_NOT_FOUND" });
  });

  it("응답 status가 오류면 SCRAPER_REQUEST_FAILED를 던진다", async () => {
    // given
    mockFetch("", 429);

    // when
    const call = provider.fetchPost(URL);

    // then
    await expect(call).rejects.toMatchObject({
      errorCode: "SCRAPER_REQUEST_FAILED",
    });
  });

  it("요청이 실패/타임아웃되면 SCRAPER_REQUEST_FAILED를 던진다", async () => {
    // given — fetch 자체가 reject (네트워크 오류/타임아웃 상황)
    globalThis.fetch = (async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as unknown as typeof fetch;

    // when
    const call = provider.fetchPost(URL);

    // then
    await expect(call).rejects.toMatchObject({
      errorCode: "SCRAPER_REQUEST_FAILED",
    });
  });
});
