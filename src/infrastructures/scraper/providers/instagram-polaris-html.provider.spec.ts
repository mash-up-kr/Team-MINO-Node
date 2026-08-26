import { afterEach, describe, expect, it, jest } from "bun:test";
import type { SentryErrorReporter } from "../../sentry/sentry-reporter";
import { InstagramPolarisHtmlProvider } from "./instagram-polaris-html.provider";

const reporter = { report: () => undefined } as unknown as SentryErrorReporter;
const createProvider = () => new InstagramPolarisHtmlProvider(reporter);

const SHORTCODE = "C7xCXAmsbZS";

// 게시글 HTML에는 Relay 프리페치 결과가 다른 JSON 사이에 섞여 들어온다.
function makeHtml(node: unknown): string {
  const blob = JSON.stringify({ if_not_gated_logged_out: node });
  return `<html><script data-sjs>{"before":{"x":1},"xig_polaris_media":${blob},"after":2}</script></html>`;
}

function mockFetch(body: string) {
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body, { status: 200 }));
}

describe("InstagramPolarisHtmlProvider", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("HTML에 박힌 게시글 노드를 잘라내 ScrapedPost로 만든다", async () => {
    mockFetch(
      makeHtml({
        __typename: "XIGPolarisImageMedia",
        code: SHORTCODE,
        // 중괄호와 따옴표를 캡션에 넣어, JSON.stringify가 만드는 \" 이스케이프 구간을
        // 균형 괄호 파서가 건너뛰는지 함께 검증한다.
        caption: { text: 'caption with } and " quote' },
        user: { pk: "10013772027", username: "egg", full_name: "Just An Egg" },
        location: null,
        image_versions2: { candidates: [{ url: "https://cdn.test/full.jpg" }] },
      }),
    );

    const post = await createProvider().fetch(SHORTCODE);

    expect(post).toEqual({
      shortcode: SHORTCODE,
      typename: "image",
      caption: 'caption with } and " quote',
      imageUrls: ["https://cdn.test/full.jpg"],
      owner: { id: "10013772027", username: "egg", fullName: "Just An Egg" },
      location: null,
    });
  });

  it("데이터 없는 로그인 셸이면 null을 돌린다 (없는 글과 차단을 구분할 수 없어 단정하지 않는다)", async () => {
    mockFetch("<!DOCTYPE html><html>login shell</html>");

    expect(await createProvider().fetch(SHORTCODE)).toBeNull();
  });
});
