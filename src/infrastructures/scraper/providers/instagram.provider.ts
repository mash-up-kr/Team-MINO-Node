import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as v from "valibot";
import { AppException } from "../../../common/exceptions/app.exception";
import type { Env } from "../../../config/env.schema";
import type {
  ScrapedAddress,
  ScrapedLocation,
  ScrapedOwner,
  ScrapedPost,
} from "../scraper.type";
import {
  type IgLocation,
  type IgOwner,
  IgResponseSchema,
  type IgShortcodeMedia,
} from "./instagram.type";

// 인스타 분석/식별용 정적 ID (거의 바뀌지 않아 상수 유지).
const X_ASBD_ID = "129477";

// 인스타 응답 지연 시 무한 대기를 막기 위한 요청 타임아웃.
const REQUEST_TIMEOUT_MS = 10_000;

// 인스타 경로(/p, /reel, /reels, /tv)에서 shortcode 추출. (호스트 검증은 별도)
const SHORTCODE_PATH_REGEX = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

@Injectable()
export class InstagramProvider {
  private readonly logger = new Logger(InstagramProvider.name);
  private readonly endpoint: string;
  private readonly docId: string;
  private readonly lsd: string;
  private readonly appId: string;
  private readonly userAgent: string;

  // TODO(다음 태스크): 인스타 토큰(doc_id/lsd/app_id 등) 자동 갱신.
  //   - 인스타가 토큰을 바꾸면 스크래핑이 깨지는데, 현재는 env라 값 변경 시 재배포가 필요함.
  //   - 토큰을 DB(예: scraper_config 테이블)로 옮기고, 별도 스크립트(크론)가 인스타 페이지를
  //     파싱해 최신 토큰을 DB에 갱신 → 재배포 없이 즉시 반영.
  //   - 조회는 인메모리 캐시(TTL)로 감싸 매 요청 DB 히트 방지, DB 미존재 시 env 기본값 폴백.
  //   - 그때 아래 ConfigService 읽기를 DB 조회 계층으로 교체하면 됨.
  constructor(configService: ConfigService<Env, true>) {
    this.endpoint = configService.get("INSTAGRAM_GRAPHQL_ENDPOINT", {
      infer: true,
    });
    this.docId = configService.get("INSTAGRAM_DOC_ID", { infer: true });
    this.lsd = configService.get("INSTAGRAM_LSD", { infer: true });
    this.appId = configService.get("INSTAGRAM_APP_ID", { infer: true });
    this.userAgent = configService.get("INSTAGRAM_USER_AGENT", { infer: true });
  }

  async fetchPost(url: string): Promise<ScrapedPost> {
    const shortcode = this.extractShortcode(url);
    const media = await this.fetchShortcodeMedia(shortcode);
    return this.toScrapedPost(media);
  }

  private extractShortcode(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw this.invalidUrl();
    }

    // 호스트가 instagram.com (또는 서브도메인)인지 먼저 확인 — 문자열 포함 검사로 인한
    // 타 도메인 우회(SSRF) 방지.
    const host = parsed.hostname.toLowerCase();
    if (host !== "instagram.com" && !host.endsWith(".instagram.com")) {
      throw this.invalidUrl();
    }

    const match = parsed.pathname.match(SHORTCODE_PATH_REGEX);
    if (!match) {
      throw this.invalidUrl();
    }
    return match[1];
  }

  private invalidUrl(): AppException {
    return new AppException(
      "INVALID_INSTAGRAM_URL",
      "지원하지 않는 인스타그램 URL 입니다.",
      HttpStatus.BAD_REQUEST,
    );
  }

  private async fetchShortcodeMedia(
    shortcode: string,
  ): Promise<IgShortcodeMedia> {
    const body = new URLSearchParams({
      variables: JSON.stringify({ shortcode }),
      doc_id: this.docId,
      lsd: this.lsd,
    });

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "User-Agent": this.userAgent,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-IG-App-ID": this.appId,
          "X-FB-LSD": this.lsd,
          "X-ASBD-ID": X_ASBD_ID,
          "Sec-Fetch-Site": "same-origin",
        },
        body,
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

    // HTML(차단 페이지 등) 응답이면 JSON 파싱이 실패할 수 있음 → upstream 오류로 취급.
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw this.upstreamFailed("응답을 JSON으로 해석할 수 없습니다.");
    }

    // 응답 구조를 경계에서 검증 → 구조 변경/예상 밖 응답을 502로 분류(우리 내부오류 아님).
    const parsed = v.safeParse(IgResponseSchema, payload);
    if (!parsed.success) {
      // 인스타 구조 변경 추적용 — 어떤 필드가 어긋났는지 남긴다.
      this.logger.warn({
        msg: "instagram response schema mismatch",
        issues: v.flatten(parsed.issues).nested,
      });
      throw this.upstreamFailed("예상하지 못한 응답 구조입니다.");
    }

    const media = parsed.output.data.xdt_shortcode_media;
    if (!media) {
      // 삭제 / 비공개 / 존재하지 않는 게시글
      throw new AppException(
        "POST_NOT_FOUND",
        "게시글을 찾을 수 없습니다. (삭제되었거나 비공개일 수 있습니다)",
        HttpStatus.NOT_FOUND,
      );
    }
    return media;
  }

  private upstreamFailed(message: string): AppException {
    return new AppException(
      "SCRAPER_REQUEST_FAILED",
      message,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private toScrapedPost(media: IgShortcodeMedia): ScrapedPost {
    return {
      shortcode: media.shortcode,
      typename: this.toTypename(media.__typename),
      caption: media.edge_media_to_caption.edges[0]?.node.text ?? null,
      imageUrls: this.toImageUrls(media),
      owner: this.toOwner(media.owner),
      location: this.toLocation(media.location),
    };
  }

  private toTypename(rawTypename: string): ScrapedPost["typename"] {
    if (rawTypename.includes("Sidecar")) return "carousel";
    if (rawTypename.includes("Video")) return "video";
    return "image";
  }

  // 캐러셀이면 각 자식의 정지 이미지(영상은 썸네일)를, 아니면 대표 이미지 1장을 반환.
  private toImageUrls(media: IgShortcodeMedia): string[] {
    const children = media.edge_sidecar_to_children?.edges;
    if (children && children.length > 0) {
      return children.map((edge) => edge.node.display_url);
    }
    return [media.display_url];
  }

  private toOwner(owner: IgOwner): ScrapedOwner {
    return {
      id: owner.id,
      username: owner.username,
      fullName: owner.full_name,
    };
  }

  private toLocation(location: IgLocation | null): ScrapedLocation | null {
    if (!location) return null;
    return {
      id: location.id,
      name: location.name,
      slug: location.slug,
      hasPublicPage: location.has_public_page,
      address: this.toAddress(location.address_json),
    };
  }

  // address_json 은 JSON 문자열. 없거나(null/undefined) 파싱 실패/빈 값은 버린다.
  private toAddress(
    addressJson: string | null | undefined,
  ): ScrapedAddress | null {
    if (!addressJson) return null;

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(addressJson) as Record<string, unknown>;
    } catch {
      return null;
    }

    const pick = (value: unknown): string | undefined =>
      typeof value === "string" && value.trim() ? value : undefined;

    const address: ScrapedAddress = {
      streetAddress: pick(raw.street_address),
      zipCode: pick(raw.zip_code),
      cityName: pick(raw.city_name),
      regionName: pick(raw.region_name),
      countryCode: pick(raw.country_code),
    };

    const hasAny = Object.values(address).some((v) => v !== undefined);
    return hasAny ? address : null;
  }
}
