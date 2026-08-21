import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { AppException } from "../../../common/exceptions/app.exception";
import type { SentryErrorReporter } from "../../sentry/sentry-reporter";
import { InstagramEmbedProvider } from "./instagram-embed.provider";

// 경로 실패 시 Sentry 보고가 테스트를 깨뜨리지 않도록 하는 스텁.
const reporter = { report: () => undefined } as unknown as SentryErrorReporter;

const SHORTCODE = "abc123";

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

function mockFetch(body: string, status = 200) {
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body, { status }));
}

describe("InstagramEmbedProvider", () => {
  let provider: InstagramEmbedProvider;

  beforeEach(() => {
    provider = new InstagramEmbedProvider(reporter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
      const post = await provider.fetch(SHORTCODE);

      // then
      expect(post?.typename).toBe("carousel");
      expect(post?.imageUrls).toEqual([
        "https://scontent.cdninstagram.com/1.jpg",
        "https://scontent.cdninstagram.com/2.jpg",
      ]);
    });

    it("단일 이미지 게시글을 ScrapedPost로 매핑한다 (캡션/작성자는 JSON 값 사용)", async () => {
      // given — 마크업의 이미지·캡션과 JSON 값이 다르면 JSON이 우선해야 한다.
      mockFetch(makeEmbedHtml({ contextMedia: makeContextMedia() }));

      // when
      const post = await provider.fetch(SHORTCODE);

      // then
      expect(post?.shortcode).toBe("abc123");
      expect(post?.typename).toBe("image");
      expect(post?.caption).toBe("성수동 카페 ☕️");
      expect(post?.imageUrls).toEqual([
        "https://scontent.cdninstagram.com/main.jpg?a=1&b=2",
      ]);
      expect(post?.owner).toEqual({
        id: "1",
        username: "onion_seongsu",
        fullName: "", // 임베드의 full_name은 null로 온다 → 빈 값으로 정규화
      });
      expect(post?.location).toBeNull();
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
      const post = await provider.fetch(SHORTCODE);

      // then
      expect(post?.typename).toBe("video");
      expect(post?.imageUrls).toEqual([
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
      const post = await provider.fetch(SHORTCODE);

      // then
      expect(post?.caption).toBe('오늘의 "최애" 카페\n2호점');
    });

    it("지원하지 않는 게시물 타입은 image로 삼키지 않고 null을 돌린다", async () => {
      // given
      mockFetch(
        makeEmbedHtml({
          contextMedia: makeContextMedia({ __typename: "GraphStory" }),
        }),
      );

      // when · then
      expect(await provider.fetch(SHORTCODE)).toBeNull();
    });

    it("contextJSON 구조가 예상과 다르면 무시하고 마크업 파싱으로 폴백한다", async () => {
      // given — 필수 필드(owner 등)가 빠진 media. 단일 이미지 게시글이므로
      // 마크업 파싱만으로 손실이 없다.
      mockFetch(makeEmbedHtml({ contextMedia: { shortcode: "abc123" } }));

      // when
      const post = await provider.fetch(SHORTCODE);

      // then — 마크업에서 뽑은 값들
      expect(post?.imageUrls).toEqual([
        "https://scontent.cdninstagram.com/img.jpg?a=1&b=2",
      ]);
      expect(post?.caption).toBe("성수동 카페 #카페 좋아요@");
    });
  });

  describe("체인 경계", () => {
    it("EmbedBrokenMedia 마커가 있으면 POST_NOT_FOUND로 체인을 끝낸다", async () => {
      // given — 게시물이 없거나 비공개/연령제한이면 인스타가 이 마커를 렌더링한다.
      mockFetch(makeEmbedHtml({ imageUrl: null, brokenMedia: true }));

      // when
      const call = provider.fetch(SHORTCODE);

      // then
      await expect(call).rejects.toBeInstanceOf(AppException);
      await expect(call).rejects.toMatchObject({ errorCode: "POST_NOT_FOUND" });
    });

    it("캐러셀인데 contextJSON이 없으면 첫 장만으로 성공하지 않고 null을 돌린다", async () => {
      // given — 첫 장만 파싱해 "성공" 처리하면 뒷장의 장소를 놓친 채 품질이
      // 조용히 떨어진다. 부분 데이터 대신 다음 경로로 넘긴다.
      mockFetch(makeEmbedHtml({ isSidecar: true }));

      // when · then
      expect(await provider.fetch(SHORTCODE)).toBeNull();
    });
  });

  describe("마크업 파싱 경로 (contextJSON 없는 단일 이미지)", () => {
    it("게시글을 ScrapedPost로 매핑한다", async () => {
      // given
      mockFetch(makeEmbedHtml());

      // when
      const post = await provider.fetch(SHORTCODE);

      // then
      expect(post?.shortcode).toBe("abc123");
      expect(post?.typename).toBe("image");
      expect(post?.caption).toBe("성수동 카페 #카페 좋아요@");
      expect(post?.imageUrls).toEqual([
        "https://scontent.cdninstagram.com/img.jpg?a=1&b=2",
      ]);
      expect(post?.owner).toEqual({
        id: "",
        username: "onion_seongsu",
        fullName: "",
      });
      expect(post?.location).toBeNull();
    });

    it.each([
      ["16진수 엔티티를 디코딩한다", "웃긴 사진&#x1F600;", "웃긴 사진😀"],
      // String.fromCodePoint는 0x10FFFF를 넘으면 RangeError를 던진다 — 원문을 보존해야 한다.
      [
        "범위를 넘은 숫자 엔티티는 그대로 둔다",
        "이상한 값&#99999999;끝",
        "이상한 값&#99999999;끝",
      ],
      [
        "모르는 명명 엔티티는 그대로 둔다",
        "생략&hellip;표시",
        "생략&hellip;표시",
      ],
    ])("캡션 엔티티 — %s", async (_label, caption, expected) => {
      mockFetch(makeEmbedHtml({ caption }));

      expect((await provider.fetch(SHORTCODE))?.caption).toBe(expected);
    });

    it("캡션이 없으면 null로 매핑한다", async () => {
      // given
      mockFetch(makeEmbedHtml({ caption: null }));

      // when
      const post = await provider.fetch(SHORTCODE);

      // then
      expect(post?.caption).toBeNull();
    });

    it("이미지도 EmbedBrokenMedia 마커도 없으면 게시글 없음으로 단정하지 않는다", async () => {
      // given — 마크업이 바뀌어 파싱이 깨진 경우. POST_NOT_FOUND로 오분류하지 않고
      // 경고 로그만 남기고 다음 경로로 넘긴다.
      mockFetch(makeEmbedHtml({ imageUrl: null }));

      // when · then
      expect(await provider.fetch(SHORTCODE)).toBeNull();
    });
  });

  it.each([
    ["응답 status 오류", () => mockFetch("", 429)],
    [
      "요청 실패·타임아웃",
      () => {
        jest
          .spyOn(globalThis, "fetch")
          .mockRejectedValue(new DOMException("timed out", "TimeoutError"));
      },
    ],
    [
      "헤더는 받았지만 본문 읽기 중 실패",
      () => {
        const response = new Response("", { status: 200 });
        response.text = () =>
          Promise.reject(new DOMException("timed out", "TimeoutError"));
        jest.spyOn(globalThis, "fetch").mockResolvedValue(response);
      },
    ],
  ])("%s면 null을 돌려 다음 경로로 넘긴다", async (_label, arrange) => {
    // given
    arrange();

    // when · then — 우리 쪽 접근 문제라 게시글 부재로 단정하지 않는다.
    expect(await provider.fetch(SHORTCODE)).toBeNull();
  });
});
