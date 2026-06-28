import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import { AppException } from "../../../common/exceptions/app.exception";
import type { Env } from "../../../config/env.schema";
import { InstagramProvider } from "./instagram.provider";

const URL = "https://www.instagram.com/p/abc123/";

// 테스트용 ConfigService 스텁 — env 기본값 흉내.
const CONFIG_STUB = {
  get: (key: string) =>
    ({
      INSTAGRAM_GRAPHQL_ENDPOINT: "https://www.instagram.com/api/graphql",
      INSTAGRAM_DOC_ID: "doc",
      INSTAGRAM_LSD: "lsd",
      INSTAGRAM_APP_ID: "app",
      INSTAGRAM_USER_AGENT: "ua",
    })[key],
} as unknown as ConfigService<Env, true>;

// Instagram GraphQL 응답을 흉내내는 헬퍼.
function makeMedia(overrides: Record<string, unknown> = {}) {
  return {
    __typename: "XDTGraphImage",
    shortcode: "abc123",
    display_url: "https://cdn.example/main.jpg",
    owner: { id: "1", username: "onion_seongsu", full_name: "어니언 성수" },
    location: null,
    edge_media_to_caption: { edges: [{ node: { text: "성수동 카페 ☕️" } }] },
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;

function mockFetch(payload: unknown, status = 200) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("InstagramProvider", () => {
  let provider: InstagramProvider;

  beforeEach(() => {
    provider = new InstagramProvider(CONFIG_STUB);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("단일 이미지 게시글을 ScrapedPost로 매핑한다", async () => {
    // given
    mockFetch({ data: { xdt_shortcode_media: makeMedia() } });

    // when
    const post = await provider.fetchPost(URL);

    // then
    expect(post.shortcode).toBe("abc123");
    expect(post.typename).toBe("image");
    expect(post.caption).toBe("성수동 카페 ☕️");
    expect(post.imageUrls).toEqual(["https://cdn.example/main.jpg"]);
    expect(post.owner).toEqual({
      id: "1",
      username: "onion_seongsu",
      fullName: "어니언 성수",
    });
    expect(post.location).toBeNull();
  });

  it("영상 게시글은 typename=video, 썸네일(display_url)을 이미지로 담는다", async () => {
    // given
    mockFetch({
      data: {
        xdt_shortcode_media: makeMedia({
          __typename: "XDTGraphVideo",
          display_url: "https://cdn.example/thumb.jpg",
        }),
      },
    });

    // when
    const post = await provider.fetchPost(URL);

    // then
    expect(post.typename).toBe("video");
    expect(post.imageUrls).toEqual(["https://cdn.example/thumb.jpg"]);
  });

  it("캐러셀은 typename=carousel, 자식들의 이미지를 순서대로 담는다", async () => {
    // given
    mockFetch({
      data: {
        xdt_shortcode_media: makeMedia({
          __typename: "XDTGraphSidecar",
          edge_sidecar_to_children: {
            edges: [
              { node: { display_url: "https://cdn.example/1.jpg" } },
              { node: { display_url: "https://cdn.example/2.jpg" } },
            ],
          },
        }),
      },
    });

    // when
    const post = await provider.fetchPost(URL);

    // then
    expect(post.typename).toBe("carousel");
    expect(post.imageUrls).toEqual([
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
    ]);
  });

  it("location의 address_json을 파싱하고 빈 문자열은 버린다", async () => {
    // given
    const addressJson = JSON.stringify({
      street_address: "경기도 성남시 분당구 판교역로 146번길 20",
      zip_code: "13529",
      city_name: "",
      region_name: "",
      country_code: "",
    });
    mockFetch({
      data: {
        xdt_shortcode_media: makeMedia({
          location: {
            id: "100",
            name: "어니언 성수",
            slug: "onion",
            has_public_page: true,
            address_json: addressJson,
          },
        }),
      },
    });

    // when
    const post = await provider.fetchPost(URL);

    // then
    expect(post.location).toEqual({
      id: "100",
      name: "어니언 성수",
      slug: "onion",
      hasPublicPage: true,
      address: {
        streetAddress: "경기도 성남시 분당구 판교역로 146번길 20",
        zipCode: "13529",
      },
    });
  });

  it("caption이 없으면 null로 매핑한다", async () => {
    // given
    mockFetch({
      data: {
        xdt_shortcode_media: makeMedia({
          edge_media_to_caption: { edges: [] },
        }),
      },
    });

    // when
    const post = await provider.fetchPost(URL);

    // then
    expect(post.caption).toBeNull();
  });

  it("reel/reels URL에서도 shortcode를 추출한다", async () => {
    // given
    mockFetch({ data: { xdt_shortcode_media: makeMedia() } });

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

  it("게시글이 없으면 POST_NOT_FOUND를 던진다", async () => {
    // given
    mockFetch({ data: { xdt_shortcode_media: null } });

    // when
    const call = provider.fetchPost(URL);

    // then
    await expect(call).rejects.toMatchObject({ errorCode: "POST_NOT_FOUND" });
  });

  it("응답 status가 오류면 SCRAPER_REQUEST_FAILED를 던진다", async () => {
    // given
    mockFetch({}, 429);

    // when
    const call = provider.fetchPost(URL);

    // then
    await expect(call).rejects.toMatchObject({
      errorCode: "SCRAPER_REQUEST_FAILED",
    });
  });

  it("HTML 등 JSON이 아닌 응답이면 SCRAPER_REQUEST_FAILED를 던진다", async () => {
    // given
    globalThis.fetch = (async () =>
      new Response("<html>blocked</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;

    // when
    const call = provider.fetchPost(URL);

    // then
    await expect(call).rejects.toMatchObject({
      errorCode: "SCRAPER_REQUEST_FAILED",
    });
  });

  it("응답 구조가 예상과 다르면 SCRAPER_REQUEST_FAILED를 던진다", async () => {
    // given — owner 등 필수 필드가 빠진 구조
    mockFetch({ data: { xdt_shortcode_media: { shortcode: "abc123" } } });

    // when
    const call = provider.fetchPost(URL);

    // then
    await expect(call).rejects.toMatchObject({
      errorCode: "SCRAPER_REQUEST_FAILED",
    });
  });
});
