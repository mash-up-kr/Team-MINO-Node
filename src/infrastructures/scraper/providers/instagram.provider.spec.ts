import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AppException } from "../../../common/exceptions/app.exception";
import type { ScrapedPost } from "../scraper.type";
import {
  type InstagramFallbackReason,
  NoopInstagramFallbackFetcher,
} from "./instagram.fallback";
import { InstagramProvider } from "./instagram.provider";

const URL = "https://www.instagram.com/p/abc123/";

// contextJSON에 들어가는 gql_data.shortcode_media를 흉내내는 헬퍼.
function makeContextMedia(overrides: Record<string, unknown> = {}) {
  return {
    __typename: "GraphImage",
    shortcode: "abc123",
    display_url: "https://scontent.cdninstagram.com/main.jpg?a=1&b=2",
    owner: { id: "1", username: "onion_seongsu", full_name: null },
    edge_media_to_caption: { edges: [{ node: { text: "성수동 카페 ☕️" } }] },
    ...overrides,
  };
}

// 임베드 페이지(https://www.instagram.com/p/{shortcode}/embed/captioned/)의
// 실제 응답 구조를 최소화해 흉내낸 HTML. (& -> &amp;, @ -> &#064; 는 인스타가 실제로 이렇게 인코딩해 준다)
// contextJSON은 실제 페이지처럼 이스케이프된 JSON 문자열 리터럴로 넣는다
// (JSON.stringify 두 번 = 객체 → JSON 텍스트 → 문자열 리터럴).
function makeEmbedHtml(
  options: {
    imageUrl?: string | null;
    caption?: string | null;
    username?: string | null;
    brokenMedia?: boolean;
    contextMedia?: Record<string, unknown> | null;
    isSidecar?: boolean;
  } = {},
) {
  const {
    imageUrl = "https://scontent.cdninstagram.com/img.jpg?a=1&amp;b=2",
    caption = '성수동 카페 <a href="/explore/tags/카페/">#카페</a> 좋아요&#064;',
    username = "onion_seongsu",
    brokenMedia = false,
    contextMedia = null,
    isSidecar = false,
  } = options;

  const contextJson =
    contextMedia === null
      ? "null"
      : JSON.stringify(
          JSON.stringify({ gql_data: { shortcode_media: contextMedia } }),
        );
  const embedData = `<script>{"isRichEmbed":true,"isSidecar":${isSidecar},"contextJSON":${contextJson}}</script>`;

  const image = imageUrl
    ? `<img class="EmbeddedMediaImage" alt="post" src="${imageUrl}">`
    : brokenMedia
      ? '<div class="EmbedBrokenMedia"></div>'
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

  return `<html><body><article><div class="EmbedContainer">${image}</div>${captionBlock}</article>${embedData}</body></html>`;
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
    provider = new InstagramProvider(new NoopInstagramFallbackFetcher());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("contextJSON 경로", () => {
    it("캐러셀은 typename=carousel, 자식들의 이미지를 순서대로 담는다", async () => {
      // given
      mockFetch(
        makeEmbedHtml({
          isSidecar: true,
          contextMedia: makeContextMedia({
            __typename: "GraphSidecar",
            edge_sidecar_to_children: {
              edges: [
                {
                  node: {
                    display_url: "https://scontent.cdninstagram.com/1.jpg",
                  },
                },
                {
                  node: {
                    display_url: "https://scontent.cdninstagram.com/2.jpg",
                  },
                },
              ],
            },
          }),
        }),
      );

      // when
      const post = await provider.fetchPost(URL);

      // then
      expect(post.typename).toBe("carousel");
      expect(post.imageUrls).toEqual([
        "https://scontent.cdninstagram.com/1.jpg",
        "https://scontent.cdninstagram.com/2.jpg",
      ]);
    });

    it("단일 이미지 게시글을 ScrapedPost로 매핑한다 (캡션/작성자는 JSON 값 사용)", async () => {
      // given — 마크업의 이미지·캡션과 JSON 값이 다르면 JSON이 우선해야 한다.
      mockFetch(makeEmbedHtml({ contextMedia: makeContextMedia() }));

      // when
      const post = await provider.fetchPost(URL);

      // then
      expect(post.shortcode).toBe("abc123");
      expect(post.typename).toBe("image");
      expect(post.caption).toBe("성수동 카페 ☕️");
      expect(post.imageUrls).toEqual([
        "https://scontent.cdninstagram.com/main.jpg?a=1&b=2",
      ]);
      expect(post.owner).toEqual({
        id: "1",
        username: "onion_seongsu",
        fullName: "", // 임베드의 full_name은 null로 온다 → 빈 값으로 정규화
      });
      expect(post.location).toBeNull();
    });

    it("영상 게시글은 typename=video, 썸네일(display_url)을 이미지로 담는다", async () => {
      // given
      mockFetch(
        makeEmbedHtml({
          contextMedia: makeContextMedia({
            __typename: "GraphVideo",
            display_url: "https://scontent.cdninstagram.com/thumb.jpg",
          }),
        }),
      );

      // when
      const post = await provider.fetchPost(URL);

      // then
      expect(post.typename).toBe("video");
      expect(post.imageUrls).toEqual([
        "https://scontent.cdninstagram.com/thumb.jpg",
      ]);
    });

    it("캡션에 따옴표가 있어도 이스케이프된 JSON을 올바르게 파싱한다", async () => {
      // given
      mockFetch(
        makeEmbedHtml({
          contextMedia: makeContextMedia({
            edge_media_to_caption: {
              edges: [{ node: { text: '오늘의 "최애" 카페\n2호점' } }],
            },
          }),
        }),
      );

      // when
      const post = await provider.fetchPost(URL);

      // then
      expect(post.caption).toBe('오늘의 "최애" 카페\n2호점');
    });

    it("지원하지 않는 게시물 타입이면 SCRAPER_REQUEST_FAILED를 던진다", async () => {
      // given
      mockFetch(
        makeEmbedHtml({
          contextMedia: makeContextMedia({ __typename: "GraphStory" }),
        }),
      );

      // when
      const call = provider.fetchPost(URL);

      // then
      await expect(call).rejects.toMatchObject({
        errorCode: "SCRAPER_REQUEST_FAILED",
      });
    });

    it("contextJSON 구조가 예상과 다르면 무시하고 마크업 파싱으로 폴백한다", async () => {
      // given — 필수 필드(owner 등)가 빠진 media. 단일 이미지 게시글이므로
      // 마크업 파싱만으로 손실이 없다.
      mockFetch(makeEmbedHtml({ contextMedia: { shortcode: "abc123" } }));

      // when
      const post = await provider.fetchPost(URL);

      // then — 마크업에서 뽑은 값들
      expect(post.imageUrls).toEqual([
        "https://scontent.cdninstagram.com/img.jpg?a=1&b=2",
      ]);
      expect(post.caption).toBe("성수동 카페 #카페 좋아요@");
    });
  });

  describe("폴백 경계", () => {
    function makeRecordingFallback(result: ScrapedPost) {
      const calls: { shortcode: string; reason: InstagramFallbackReason }[] =
        [];
      const fallback = {
        fetchPost: async (
          shortcode: string,
          reason: InstagramFallbackReason,
        ) => {
          calls.push({ shortcode, reason });
          return result;
        },
      };
      return { calls, fallback };
    }

    const FALLBACK_POST: ScrapedPost = {
      shortcode: "abc123",
      typename: "carousel",
      caption: "폴백이 가져온 게시글",
      imageUrls: ["https://scontent.cdninstagram.com/fb.jpg"],
      owner: { id: "", username: "", fullName: "" },
      location: null,
    };

    it("캐러셀인데 contextJSON이 없으면 첫 장만으로 성공하지 않고 폴백을 호출한다", async () => {
      // given — 첫 장만 파싱해 "성공" 처리하면 뒷장의 장소를 놓친 채 품질이
      // 조용히 떨어지므로, 부분 데이터 대신 폴백으로 넘겨야 한다.
      const { calls, fallback } = makeRecordingFallback(FALLBACK_POST);
      provider = new InstagramProvider(fallback as never);
      mockFetch(makeEmbedHtml({ isSidecar: true }));

      // when
      const post = await provider.fetchPost(URL);

      // then
      expect(calls).toEqual([
        { shortcode: "abc123", reason: "CAROUSEL_DATA_MISSING" },
      ]);
      expect(post).toEqual(FALLBACK_POST);
    });

    it("EmbedBrokenMedia 마커가 있으면 폴백을 호출한다 (연령제한 게시글은 폴백이 가져올 수 있다)", async () => {
      // given
      const { calls, fallback } = makeRecordingFallback(FALLBACK_POST);
      provider = new InstagramProvider(fallback as never);
      mockFetch(makeEmbedHtml({ imageUrl: null, brokenMedia: true }));

      // when
      const post = await provider.fetchPost(URL);

      // then
      expect(calls).toEqual([{ shortcode: "abc123", reason: "EMBED_BLOCKED" }]);
      expect(post).toEqual(FALLBACK_POST);
    });

    it("폴백 미구성(Noop) 시 EmbedBrokenMedia는 POST_NOT_FOUND를 던진다", async () => {
      // given — 게시물이 없거나 비공개/연령제한이면 인스타가 이 마커를 렌더링한다.
      mockFetch(makeEmbedHtml({ imageUrl: null, brokenMedia: true }));

      // when
      const call = provider.fetchPost(URL);

      // then
      await expect(call).rejects.toMatchObject({ errorCode: "POST_NOT_FOUND" });
    });

    it("폴백 미구성(Noop) 시 contextJSON 없는 캐러셀은 SCRAPER_REQUEST_FAILED를 던진다", async () => {
      // given
      mockFetch(makeEmbedHtml({ isSidecar: true }));

      // when
      const call = provider.fetchPost(URL);

      // then
      await expect(call).rejects.toMatchObject({
        errorCode: "SCRAPER_REQUEST_FAILED",
      });
    });
  });

  describe("마크업 파싱 경로 (contextJSON 없는 단일 이미지)", () => {
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

    it("이미지도 EmbedBrokenMedia 마커도 없으면 게시글 없음이 아니라 SCRAPER_REQUEST_FAILED를 던진다", async () => {
      // given — 마크업이 바뀌어 파싱이 깨진 경우. "게시글 없음"으로 조용히
      // 오분류하면 안 되고, 알림 가능한 실패로 남아야 한다.
      mockFetch(makeEmbedHtml({ imageUrl: null }));

      // when
      const call = provider.fetchPost(URL);

      // then
      await expect(call).rejects.toMatchObject({
        errorCode: "SCRAPER_REQUEST_FAILED",
      });
    });
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

  it("응답 헤더는 받았지만 본문 읽기 중 실패하면 SCRAPER_REQUEST_FAILED를 던진다", async () => {
    // given — 느린 연결에서 헤더는 왔지만 스트리밍 중 타임아웃되는 상황을 흉내낸다.
    globalThis.fetch = (async () => {
      const response = new Response("", { status: 200 });
      response.text = async () => {
        throw new DOMException("timed out", "TimeoutError");
      };
      return response;
    }) as unknown as typeof fetch;

    // when
    const call = provider.fetchPost(URL);

    // then
    await expect(call).rejects.toMatchObject({
      errorCode: "SCRAPER_REQUEST_FAILED",
    });
  });
});
