import { afterEach, describe, expect, it, jest } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import { AppException } from "../../../common/exceptions/app.exception";
import type { Env } from "../../../config/env.schema";
import type { SentryErrorReporter } from "../../sentry/sentry-reporter";
import { InstagramPolarisJsonProvider } from "./instagram-polaris-json.provider";

const SHORTCODE = "DPJF4CjCSUY";
const HOME_HTML = `<html><script>"LSD",[],{"token":"lsd-token"}</script></html>`;

function createProvider() {
  const env: Record<string, string> = {
    INSTAGRAM_GRAPHQL_ENDPOINT: "https://www.instagram.com/api/graphql",
    INSTAGRAM_DOC_ID: "27130156389949648",
    INSTAGRAM_APP_ID: "936619743392459",
  };
  const configService = {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService<Env, true>;

  const reporter = {
    report: () => undefined,
  } as unknown as SentryErrorReporter;

  return new InstagramPolarisJsonProvider(configService, reporter);
}

// 실제 응답에서 우리가 쓰는 필드만 남긴 노드.
function makeNode() {
  return {
    __typename: "XIGPolarisCarouselMedia",
    code: SHORTCODE,
    caption: { text: "문래 맛집" },
    user: { pk: "18070596058", username: "mukgenie", full_name: "먹지니" },
    location: {
      pk: 300097854,
      name: "문래동",
      lat: 37.518711390369,
      lng: 126.8886649514,
    },
    carousel_media: [
      { image_versions2: { candidates: [{ url: "https://cdn.test/1.jpg" }] } },
      { image_versions2: { candidates: [{ url: "https://cdn.test/2.jpg" }] } },
    ],
  };
}

/** 첫 호출은 lsd용 홈페이지, 두 번째는 GraphQL 응답. */
function mockFetch(graphqlBody: unknown) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(HOME_HTML, { status: 200 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify(graphqlBody), { status: 200 }),
    );
}

describe("InstagramPolarisJsonProvider", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("게시글 노드를 ScrapedPost로 정규화한다", async () => {
    mockFetch({
      data: { xig_polaris_media: { if_not_gated_logged_out: makeNode() } },
    });

    const post = await createProvider().fetch(SHORTCODE);

    expect(post).toEqual({
      shortcode: SHORTCODE,
      typename: "carousel",
      caption: "문래 맛집",
      imageUrls: ["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"],
      owner: { id: "18070596058", username: "mukgenie", fullName: "먹지니" },
      location: {
        id: "300097854",
        name: "문래동",
        lat: 37.518711390369,
        lng: 126.8886649514,
      },
    });
  });

  it("errors가 함께 와도 data가 있으면 성공으로 처리한다", async () => {
    // 인스타 서버가 location.profile_pic_url 리졸버에서 터지지만 data는 완전하다.
    // errors 유무로 실패를 판정하면 location이 붙은 게시글이 전부 실패한다.
    mockFetch({
      errors: [
        {
          message: "A server error field_exception occured.",
          path: [
            "xig_polaris_media",
            "if_not_gated_logged_out",
            "location",
            "profile_pic_url",
          ],
        },
      ],
      data: { xig_polaris_media: { if_not_gated_logged_out: makeNode() } },
    });

    const post = await createProvider().fetch(SHORTCODE);

    expect(post?.location?.name).toBe("문래동");
  });

  it("xig_polaris_media가 null이면 POST_NOT_FOUND로 체인을 끝낸다", async () => {
    mockFetch({ data: { xig_polaris_media: null } });

    const promise = createProvider().fetch(SHORTCODE);

    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "POST_NOT_FOUND",
    });
  });

  it("doc_id가 교체되면 null을 돌려 다음 경로로 넘긴다", async () => {
    mockFetch({
      errors: [
        {
          message:
            "The GraphQL document with ID 27130156389949649 was not found.",
        },
      ],
    });

    expect(await createProvider().fetch(SHORTCODE)).toBeNull();
  });

  it("JSON이 아닌 응답(차단 셸)이면 null을 돌린다", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(HOME_HTML, { status: 200 }))
      .mockResolvedValueOnce(new Response("<!DOCTYPE html>", { status: 200 }));

    expect(await createProvider().fetch(SHORTCODE)).toBeNull();
  });
});
