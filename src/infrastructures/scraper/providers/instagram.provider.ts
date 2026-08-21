import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import * as v from "valibot";
import { AppException } from "../../../common/exceptions/app.exception";
import { extractInstagramShortcode } from "../instagram.util";
import type { ScrapedPost } from "../scraper.type";
import { InstagramFallbackFetcher } from "./instagram.fallback";
import { EmbedContextSchema, type EmbedShortcodeMedia } from "./instagram.type";

// 인스타 응답 지연 시 무한 대기를 막기 위한 요청 타임아웃.
const REQUEST_TIMEOUT_MS = 10_000;

/*
 * 실제 브라우저처럼 보이는 User-Agent(Chrome 등)를 보내면 인스타가 클라이언트
 * 렌더링용 JS 셀만 내려주고 콘텐츠는 비워서 준다. 평범한/무표시 User-Agent에는
 * 서버 렌더링된 정적 HTML(우리가 원하는 것)을 그대로 준다. 실제로 헤더를 바꿔가며
 * 확인함 — 브라우저 UA는 611KB짜리 빈 셀, 이 값은 344KB짜리 실제 콘텐츠.
 */
const EMBED_REQUEST_USER_AGENT = "team-mino-place-extraction/1.0";

/*
 * 임베드 HTML에는 화면에 그려진 마크업(첫 장 이미지뿐)과 별개로, 페이지 렌더링에 쓰인
 * 원본 데이터가 contextJSON이라는 이스케이프된 JSON 문자열로 통째로 들어 있다.
 * 캐러셀 전체 이미지·캡션 전문·작성자가 다 여기 있으므로 이것이 1차 파싱 경로다.
 * (실제 게시글로 확인: 10장 캐러셀은 물론 15장 캐러셀도 전체가 들어 있다)
 */
const CONTEXT_JSON_REGEX = /"contextJSON":"((?:[^"\\]|\\.)*)"/;
// contextJSON이 null인 게시글도 있는데(오래된 게시글에서 확인), 그때도 캐러셀 여부는
// 페이지의 이 플래그로 알 수 있다 — 단일 이미지면 마크업 파싱만으로 손실이 없다.
const IS_SIDECAR_REGEX = /"isSidecar":(true|false)/;

// 대표 이미지: <img class="EmbeddedMediaImage" ... src="...">
const MEDIA_IMAGE_REGEX = /<img class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/;
// 삭제/비공개/존재하지 않는 게시글은 인스타가 이 마커로 명시적으로 알려준다
// (실제로 확인함: 없는 shortcode는 class="EmbedBrokenMedia"를 포함한 페이지를 준다).
const BROKEN_MEDIA_REGEX = /class="EmbedBrokenMedia"/;
// Caption div는 "View all N comments"(class="CaptionComments")를 캡션 텍스트 뒤에
// 자기 안에 품고 있다. 항상 뒤따르는 형제 Footer div를 경계로 통째로 잘라낸 뒤,
// CaptionComments 조각만 별도로 도려낸다.
const CAPTION_SECTION_REGEX =
  /<div class="Caption">([\s\S]*?)<div class="Footer">/;
const CAPTION_COMMENTS_REGEX = /<div class="CaptionComments">[\s\S]*?<\/div>/;
// 실제 마크업엔 앞에 공백이 없지만, 혹시 모를 포맷팅 변화에 대비해 \s*를 둔다.
const CAPTION_USERNAME_LINK_REGEX =
  /^\s*<a class="CaptionUsername"[^>]*>.*?<\/a>/;
const OWNER_USERNAME_REGEX = /<a class="CaptionUsername"[^>]*>([^<]*)<\/a>/;

// 임베드 HTML은 URL/캡션에 HTML 엔티티를 인코딩해서 준다
// (예: "&" -> "&amp;", "@" -> "&#064;"). 이미지 URL은 디코딩하지 않으면
// 쿼리스트링이 깨져 다운로드가 실패한다.
const HTML_ENTITY_REGEX = /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g;
const MAX_UNICODE_CODE_POINT = 0x10ffff;
const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(HTML_ENTITY_REGEX, (entity, body: string) => {
    if (body[0] !== "#") {
      return NAMED_HTML_ENTITIES[body] ?? entity;
    }
    const isHex = body[1] === "x" || body[1] === "X";
    const codePoint = Number.parseInt(
      body.slice(isHex ? 2 : 1),
      isHex ? 16 : 10,
    );
    // 유효 범위를 벗어나면 fromCodePoint가 RangeError를 던지므로, 원문을 그대로 둔다.
    // (정규식이 숫자만 매칭하므로 codePoint는 음수가 될 수 없다.)
    if (Number.isNaN(codePoint) || codePoint > MAX_UNICODE_CODE_POINT) {
      return entity;
    }
    return String.fromCodePoint(codePoint);
  });
}

@Injectable()
export class InstagramProvider {
  private readonly logger = new Logger(InstagramProvider.name);

  constructor(private readonly fallbackFetcher: InstagramFallbackFetcher) {}

  async fetchPost(url: string): Promise<ScrapedPost> {
    const shortcode = extractInstagramShortcode(url);
    const html = await this.fetchEmbedHtml(shortcode);

    // 1차: 페이지에 내장된 원본 JSON. 캐러셀 전체 이미지가 들어 있는 유일한 경로.
    const media = this.parseContextMedia(html, shortcode);
    if (media) {
      return this.toScrapedPost(media);
    }

    // 게시글 노출 자체가 거부된 페이지 — 삭제/비공개/연령제한/임베드 차단 계정.
    // (연령제한 게시글도 이 마커로 온다는 것을 실제 게시글로 확인함)
    if (BROKEN_MEDIA_REGEX.test(html)) {
      return this.fallbackFetcher.fetchPost(shortcode, "EMBED_BLOCKED");
    }

    // 캐러셀인데 contextJSON이 없으면 마크업에는 첫 장만 남는다. 부분 데이터로
    // "성공" 처리하면 뒷장에만 장소가 있는 게시글에서 품질이 조용히 떨어지므로
    // 폴백 경계로 넘긴다.
    if (IS_SIDECAR_REGEX.exec(html)?.[1] === "true") {
      return this.fallbackFetcher.fetchPost(shortcode, "CAROUSEL_DATA_MISSING");
    }

    // 단일 이미지 게시글은 마크업의 대표 이미지 1장이 곧 전체다 — 손실 없이 파싱한다.
    return this.parseFromMarkup(html, shortcode);
  }

  private parseContextMedia(
    html: string,
    shortcode: string,
  ): EmbedShortcodeMedia | null {
    const match = html.match(CONTEXT_JSON_REGEX);
    if (!match) return null;

    let payload: unknown;
    try {
      // 이스케이프된 문자열 리터럴이므로 두 번 파싱한다(리터럴 해제 → 객체).
      payload = JSON.parse(JSON.parse(`"${match[1]}"`));
    } catch {
      this.logger.warn({ shortcode }, "인스타그램 contextJSON 파싱 실패");
      return null;
    }

    const parsed = v.safeParse(EmbedContextSchema, payload);
    if (!parsed.success) {
      // 인스타 구조 변경 추적용 — 어떤 필드가 어긋났는지 남긴다.
      this.logger.warn(
        { shortcode, issues: v.flatten(parsed.issues).nested },
        "인스타그램 contextJSON 구조가 예상과 다릅니다",
      );
      return null;
    }
    return parsed.output.gql_data?.shortcode_media ?? null;
  }

  private toScrapedPost(media: EmbedShortcodeMedia): ScrapedPost {
    return {
      shortcode: media.shortcode,
      typename: this.toTypename(media.__typename),
      caption: media.edge_media_to_caption?.edges[0]?.node.text ?? null,
      imageUrls: this.toImageUrls(media),
      owner: {
        id: media.owner.id,
        username: media.owner.username,
        fullName: media.owner.full_name ?? "",
      },
      // 임베드의 gql_data에는 location 키 자체가 없다. AI가 사진/캡션으로 추론한다.
      location: null,
    };
  }

  // 접두사 변형(GraphImage / XDTGraphImage 등)은 허용하되, 미지원 타입은 조용히
  // image로 삼키지 않고 upstream 오류로 실패시킨다(잘못된 데이터가 AI 단계로 가는 것 방지).
  private toTypename(rawTypename: string): ScrapedPost["typename"] {
    if (rawTypename.includes("Sidecar")) return "carousel";
    if (rawTypename.includes("Video")) return "video";
    if (rawTypename.includes("Image")) return "image";
    throw this.upstreamFailed(
      `지원하지 않는 인스타 게시물 타입입니다. (${rawTypename})`,
    );
  }

  // 캐러셀이면 각 자식의 정지 이미지(영상은 썸네일)를, 아니면 대표 이미지 1장을 반환.
  private toImageUrls(media: EmbedShortcodeMedia): string[] {
    const children = media.edge_sidecar_to_children?.edges;
    if (children && children.length > 0) {
      return children.map((edge) => edge.node.display_url);
    }
    return [media.display_url];
  }

  // 마크업 파싱 폴백: contextJSON이 null인 단일 이미지 게시글 전용(isSidecar:false 확인 후).
  private parseFromMarkup(html: string, shortcode: string): ScrapedPost {
    const imageUrl = this.extractImageUrl(html);
    if (!imageUrl) {
      // BROKEN_MEDIA 마커도 없이 이미지를 못 찾았다면 게시글이 없는 게 아니라
      // 인스타가 마크업을 바꿔 파싱이 깨진 것 — 다르게 알려야 조용히 묻히지 않는다.
      this.logger.warn(
        { shortcode },
        "인스타그램 임베드 응답 구조가 예상과 다릅니다",
      );
      throw this.upstreamFailed("예상하지 못한 응답 구조입니다.");
    }

    return {
      shortcode,
      // isSidecar:false로 확인된 게시글만 이 경로로 온다 — 이미지 1장이 전체다.
      typename: "image",
      caption: this.extractCaption(html),
      imageUrls: [imageUrl],
      // username 외 필드는 임베드 마크업에 없다. 이 값들은 어디서도 읽히지 않는다.
      owner: {
        id: "",
        username: this.extractUsername(html) ?? "",
        fullName: "",
      },
      // 인스타가 태그한 장소 정보는 임베드 페이지에 없다. AI가 사진/캡션으로 추론한다.
      location: null,
    };
  }

  private async fetchEmbedHtml(shortcode: string): Promise<string> {
    const requestUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;

    try {
      const response = await fetch(requestUrl, {
        headers: { "User-Agent": EMBED_REQUEST_USER_AGENT },
        // 타임아웃 초과 시 fetch/본문 읽기가 reject → 아래 catch에서 502로 변환.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw this.upstreamFailed(
          `인스타그램 응답 오류입니다. (status: ${response.status})`,
        );
      }

      // 응답 헤더까지는 받았지만 본문 스트리밍 중 타임아웃/연결 끊김이 나면
      // 여기서도 reject된다 — fetch()만 감싸고 이 호출을 밖에 두면 놓친다.
      return await response.text();
    } catch (error) {
      if (error instanceof AppException) throw error;
      // 타임아웃/DNS 등 원인 구분을 위해 원본 에러를 남긴다(사용자 응답은 그대로 502).
      this.logger.warn(
        { err: error, shortcode },
        "인스타그램 임베드 요청 실패",
      );
      throw this.upstreamFailed(
        "인스타그램 요청에 실패했거나 시간이 초과됐습니다.",
      );
    }
  }

  private extractImageUrl(html: string): string | null {
    const match = html.match(MEDIA_IMAGE_REGEX);
    return match ? decodeHtmlEntities(match[1]) : null;
  }

  private extractUsername(html: string): string | null {
    const match = html.match(OWNER_USERNAME_REGEX);
    return match ? decodeHtmlEntities(match[1]).trim() : null;
  }

  private extractCaption(html: string): string | null {
    const block = html.match(CAPTION_SECTION_REGEX)?.[1];
    if (!block) return null;

    const withoutUsername = block.replace(CAPTION_USERNAME_LINK_REGEX, "");
    const withoutComments = withoutUsername.replace(CAPTION_COMMENTS_REGEX, "");
    const text = withoutComments
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<a[^>]*>(.*?)<\/a>/g, "$1")
      .replace(/<[^>]+>/g, "");

    const decoded = decodeHtmlEntities(text).trim();
    return decoded || null;
  }

  private upstreamFailed(message: string): AppException {
    return new AppException(
      "SCRAPER_REQUEST_FAILED",
      message,
      HttpStatus.BAD_GATEWAY,
    );
  }
}
