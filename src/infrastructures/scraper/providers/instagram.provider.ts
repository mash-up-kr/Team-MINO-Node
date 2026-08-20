import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../../common/exceptions/app.exception";
import { extractInstagramShortcode } from "../instagram.util";
import type { ScrapedPost } from "../scraper.type";
import { decodeHtmlEntities } from "./instagram.type";

// 인스타 응답 지연 시 무한 대기를 막기 위한 요청 타임아웃.
const REQUEST_TIMEOUT_MS = 10_000;

/*
 * 실제 브라우저처럼 보이는 User-Agent(Chrome 등)를 보내면 인스타가 클라이언트
 * 렌더링용 JS 셀만 내려주고 콘텐츠는 비워서 준다. 평범한/무표시 User-Agent에는
 * 서버 렌더링된 정적 HTML(우리가 원하는 것)을 그대로 준다. 실제로 헤더를 바꿔가며
 * 확인함 — 브라우저 UA는 611KB짜리 빈 셀, 이 값은 344KB짜리 실제 콘텐츠.
 */
const EMBED_REQUEST_USER_AGENT = "team-mino-place-extraction/1.0";

// 대표 이미지: <img class="EmbeddedMediaImage" ... src="...">
const MEDIA_IMAGE_REGEX = /<img class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/;
// Caption div는 "View all N comments"(class="CaptionComments")를 캡션 텍스트 뒤에
// 자기 안에 품고 있다. 항상 뒤따르는 형제 Footer div를 경계로 통째로 잘라낸 뒤,
// CaptionComments 조각만 별도로 도려낸다.
const CAPTION_SECTION_REGEX =
  /<div class="Caption">([\s\S]*?)<div class="Footer">/;
const CAPTION_COMMENTS_REGEX = /<div class="CaptionComments">[\s\S]*?<\/div>/;
const CAPTION_USERNAME_LINK_REGEX = /^<a class="CaptionUsername"[^>]*>.*?<\/a>/;
const OWNER_USERNAME_REGEX = /<a class="CaptionUsername"[^>]*>([^<]*)<\/a>/;

@Injectable()
export class InstagramProvider {
  async fetchPost(url: string): Promise<ScrapedPost> {
    const shortcode = extractInstagramShortcode(url);
    const html = await this.fetchEmbedHtml(shortcode);

    const imageUrl = this.extractImageUrl(html);
    if (!imageUrl) {
      // 삭제 / 비공개 / 존재하지 않는 게시글은 대표 이미지가 렌더링되지 않는다.
      throw new AppException(
        "POST_NOT_FOUND",
        "게시글을 찾을 수 없습니다. (삭제되었거나 비공개일 수 있습니다)",
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      shortcode,
      // 임베드 페이지는 사진/영상/캐러셀을 구분해 주지 않고 대표 이미지 1장만 준다.
      // 이 필드를 읽는 곳이 없어 구분할 필요가 없다.
      typename: "image",
      caption: this.extractCaption(html),
      imageUrls: [imageUrl],
      // username 외 필드는 임베드 페이지에 없다. 이 값들은 어디서도 읽히지 않는다.
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

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        headers: { "User-Agent": EMBED_REQUEST_USER_AGENT },
        // 타임아웃 초과 시 fetch가 reject → 아래 catch에서 502로 변환.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw this.upstreamFailed(
        "인스타그램 요청에 실패했거나 시간이 초과됐습니다.",
      );
    }

    if (!response.ok) {
      throw this.upstreamFailed(
        `인스타그램 응답 오류입니다. (status: ${response.status})`,
      );
    }

    return response.text();
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
