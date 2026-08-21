import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import * as v from "valibot";
import { AppException } from "../../../common/exceptions/app.exception";
import { SentryErrorReporter } from "../../sentry/sentry-reporter";
import { fetchInstagram, toScrapedTypename } from "../instagram.util";
import type { InstagramProvider, ScrapedPost } from "../scraper.type";
import {
  EmbedContextSchema,
  type EmbedShortcodeMedia,
} from "./instagram-embed.type";

/**
 * 3순위 — 외부 사이트 삽입용 임베드 페이지.
 *
 * Polaris와 다른 표면이라 Polaris가 통째로 막혀도 살아남는 것이 존재 이유다.
 * 대신 location과 owner.fullName이 응답에 아예 없다.
 */
@Injectable()
export class InstagramEmbedProvider implements InstagramProvider {
  readonly name = "embed" as const;

  private readonly logger = new Logger(InstagramEmbedProvider.name);

  constructor(private readonly reporter: SentryErrorReporter) {}

  async fetch(shortcode: string): Promise<ScrapedPost | null> {
    const html = await fetchInstagram(`/p/${shortcode}/embed/captioned/`);
    if (!html) return this.miss("request-failed", { shortcode });

    const media = this.parseContextMedia(html, shortcode);
    if (media) return this.toPost(media);

    // 삭제/비공개/연령제한 게시글은 인스타가 이 마커로 알려준다(셋의 구분은 불가).
    if (html.includes('class="EmbedBrokenMedia"')) {
      throw new AppException(
        "POST_NOT_FOUND",
        "게시글을 찾을 수 없습니다. (삭제되었거나 비공개·연령제한일 수 있습니다)",
        HttpStatus.NOT_FOUND,
      );
    }

    // 캐러셀인데 contextJSON이 없으면 마크업에는 첫 장만 남는다. 부분 데이터로 성공
    // 처리하면 뒷장에만 장소가 있는 게시글에서 품질이 조용히 떨어진다.
    if (/"isSidecar":(true|false)/.exec(html)?.[1] === "true") {
      return this.miss("carousel-without-context", { shortcode });
    }

    return this.parseFromMarkup(html, shortcode);
  }

  /**
   * 화면 마크업(첫 장뿐)과 별개로, 렌더링에 쓰인 원본 데이터가 이스케이프된 JSON
   * 문자열로 통째로 들어 있다. 캐러셀 전체 이미지가 여기에만 있다.
   */
  private parseContextMedia(
    html: string,
    shortcode: string,
  ): EmbedShortcodeMedia | null {
    const escaped = /"contextJSON":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1];
    if (!escaped) return null;

    let payload: unknown;
    try {
      // 이스케이프된 문자열 리터럴이라 두 번 파싱한다(리터럴 해제 → 객체).
      payload = JSON.parse(JSON.parse(`"${escaped}"`));
    } catch {
      return this.miss("context-json-unparsable", { shortcode });
    }

    const parsed = v.safeParse(EmbedContextSchema, payload);
    if (!parsed.success) {
      return this.miss("context-json-schema-mismatch", {
        shortcode,
        issues: v.flatten(parsed.issues).nested,
      });
    }
    return parsed.output.gql_data?.shortcode_media ?? null;
  }

  private toPost(media: EmbedShortcodeMedia): ScrapedPost | null {
    const typename = toScrapedTypename(media.__typename);
    if (!typename) {
      return this.miss("unsupported-typename", {
        shortcode: media.shortcode,
        typename: media.__typename,
      });
    }

    const children = media.edge_sidecar_to_children?.edges;
    return {
      shortcode: media.shortcode,
      typename,
      caption: media.edge_media_to_caption?.edges[0]?.node.text ?? null,
      imageUrls: children?.length
        ? children.map((edge) => edge.node.display_url)
        : [media.display_url],
      owner: {
        id: media.owner.id,
        username: media.owner.username,
        fullName: media.owner.full_name ?? "",
      },
      // 임베드 응답에는 location 키 자체가 없다. AI가 사진·캡션으로 추론한다.
      location: null,
    };
  }

  /** contextJSON이 없는 단일 이미지 게시글 전용(isSidecar:false 확인 후). */
  private parseFromMarkup(html: string, shortcode: string): ScrapedPost | null {
    const imageUrl = /<img class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/.exec(
      html,
    )?.[1];
    if (!imageUrl) {
      // BROKEN_MEDIA 마커도 없이 못 찾았다면 게시글이 없는 게 아니라 마크업이 바뀐 것.
      return this.miss("markup-changed", { shortcode });
    }

    const username = /<a class="CaptionUsername"[^>]*>([^<]*)<\/a>/.exec(
      html,
    )?.[1];

    return {
      shortcode,
      // isSidecar:false로 확인된 게시글만 여기 온다 — 이미지 1장이 전체다.
      typename: "image",
      caption: extractCaption(html),
      imageUrls: [decodeHtmlEntities(imageUrl)],
      // 마크업에는 username 외 작성자 정보가 없다.
      owner: {
        id: "",
        username: username ? decodeHtmlEntities(username).trim() : "",
        fullName: "",
      },
      location: null,
    };
  }

  /** 다음 경로로 넘긴다. 경로별로 한 이슈에 묶이도록 Sentry 메시지는 고정한다. */
  private miss(reason: string, extra: Record<string, unknown>): null {
    const payload = { reason, ...extra };
    this.logger.warn(payload, "다음 경로로 넘긴다");
    this.reporter.report(new Error("인스타 스크래퍼 실패 — embed"), {
      errorCode: "SCRAPER_PROVIDER_MISS",
      extra: payload,
    });
    return null;
  }
}

function extractCaption(html: string): string | null {
  // Caption div는 "View all N comments"를 캡션 뒤에 품고 있다. 뒤따르는 형제
  // Footer div를 경계로 잘라낸 뒤 그 조각만 도려낸다.
  const block = /<div class="Caption">([\s\S]*?)<div class="Footer">/.exec(
    html,
  )?.[1];
  if (!block) return null;

  const text = block
    .replace(/^\s*<a class="CaptionUsername"[^>]*>.*?<\/a>/, "")
    .replace(/<div class="CaptionComments">[\s\S]*?<\/div>/, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a[^>]*>(.*?)<\/a>/g, "$1")
    .replace(/<[^>]+>/g, "");

  return decodeHtmlEntities(text).trim() || null;
}

/**
 * 임베드 HTML은 URL·캡션을 HTML 엔티티로 인코딩해 준다(예: "&" → "&amp;").
 * 디코딩하지 않으면 이미지 URL의 쿼리스트링이 깨져 다운로드가 실패한다.
 */
function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value.replace(
    /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g,
    (entity, body: string) => {
      if (!body.startsWith("#")) return named[body] ?? entity;

      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = Number.parseInt(
        body.slice(isHex ? 2 : 1),
        isHex ? 16 : 10,
      );
      // 범위를 벗어나면 fromCodePoint가 던지므로 원문을 그대로 둔다.
      if (Number.isNaN(codePoint) || codePoint > 0x10ffff) return entity;
      return String.fromCodePoint(codePoint);
    },
  );
}
