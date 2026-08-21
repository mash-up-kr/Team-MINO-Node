import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppException } from "../../../common/exceptions/app.exception";
import type { Env } from "../../../config/env.schema";
import { SentryErrorReporter } from "../../sentry/sentry-reporter";
import {
  fetchInstagram,
  INSTAGRAM_ORIGIN,
  shortcodeToMediaId,
} from "../instagram.util";
import type { InstagramProvider, ScrapedPost } from "../scraper.type";
import { toScrapedPost } from "./instagram-polaris.mapper";

// 인스타 로그아웃 웹앱이 자기 요청에 싣는 앱 식별자. 홈페이지·GraphQL 양쪽에 필요하다.
const APP_ID = "936619743392459";

/**
 * 1순위 — 인스타 로그아웃 웹앱의 persisted GraphQL.
 *
 * 순수 JSON이라 파싱이 가장 견고하고 응답도 HTML 경로의 1/3이다. 대신 doc_id에
 * 의존하므로 인스타가 이를 교체하면 죽고, 그때는 polaris-html이 받아낸다.
 */
@Injectable()
export class InstagramPolarisJsonProvider implements InstagramProvider {
  readonly name = "polaris-json" as const;

  private readonly logger = new Logger(InstagramPolarisJsonProvider.name);
  private readonly docId: string;

  // lsd는 게시글과 무관해 재사용한다 — 게시글당 왕복을 1회로 유지한다.
  private lsd: { token: string; issuedAt: number } | null = null;

  constructor(
    configService: ConfigService<Env, true>,
    private readonly reporter: SentryErrorReporter,
  ) {
    this.docId = configService.get("INSTAGRAM_DOC_ID", { infer: true });
  }

  async fetch(shortcode: string): Promise<ScrapedPost | null> {
    const lsd = await this.resolveLsd();
    if (!lsd) return this.miss("no-lsd-token", { shortcode });

    const payload = await this.query(shortcode, lsd);
    if (!payload) {
      // 토큰 만료로 셸을 받았을 수 있으니 폐기한다. 이 요청은 다음 경로가 처리한다.
      this.lsd = null;
      return this.miss("not-json", { shortcode });
    }

    // 게시글이 없으면 이 키가 null로 온다 — 뒤 경로를 헛돌 필요가 없다.
    if (payload.data?.xig_polaris_media === null) {
      throw new AppException(
        "POST_NOT_FOUND",
        "게시글을 찾을 수 없습니다. (삭제되었거나 비공개일 수 있습니다)",
        HttpStatus.NOT_FOUND,
      );
    }

    const node = payload.data?.xig_polaris_media?.if_not_gated_logged_out;
    if (!node) {
      const message = payload.errors?.[0]?.message ?? "";
      // doc_id가 교체됐을 때만 오는 메시지. 갱신이 필요하다는 뜻이라 이유를 구분한다.
      const staleDocId = message.includes("The GraphQL document with ID");
      return this.miss(staleDocId ? "stale-doc-id" : "no-media-node", {
        shortcode,
        docId: this.docId,
        message,
      });
    }

    return toScrapedPost(node, (issues) =>
      this.miss("schema-mismatch", { shortcode, issues }),
    );
  }

  /** 다음 경로로 넘긴다. 경로별로 한 이슈에 묶이도록 Sentry 메시지는 고정한다. */
  private miss(reason: string, extra: Record<string, unknown>): null {
    const payload = { reason, ...extra };
    this.logger.warn(payload, "다음 경로로 넘긴다");
    this.reporter.report(new Error("인스타 스크래퍼 실패 — polaris-json"), {
      errorCode: "SCRAPER_PROVIDER_MISS",
      extra: payload,
    });
    return null;
  }

  /**
   * GraphQL은 errors와 data를 함께 반환한다. location.profile_pic_url 리졸버가 인스타
   * 서버에서 터져 location이 붙은 게시글마다 errors가 실려오지만 data는 완전하므로,
   * errors 유무로 실패를 판정하지 않는다.
   */
  private async query(
    shortcode: string,
    lsd: string,
  ): Promise<PolarisGraphqlPayload | null> {
    const text = await fetchInstagram("/api/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${INSTAGRAM_ORIGIN}/p/${shortcode}/`,
        "X-IG-App-ID": APP_ID,
        // Meta 분석용 정적 ID. 없으면 로그아웃 GraphQL이 거부한다.
        "X-ASBD-ID": "359341",
        "X-IG-WWW-Claim": "0",
        "X-FB-LSD": lsd,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({
        lsd,
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name:
          "PolarisLoggedOutDesktopWWWPostRootContentQuery",
        variables: JSON.stringify({ media_id: shortcodeToMediaId(shortcode) }),
        doc_id: this.docId,
        server_timestamps: "true",
      }),
    });
    if (!text) return null;

    try {
      return JSON.parse(text) as PolarisGraphqlPayload;
    } catch {
      this.logger.warn({ shortcode }, "응답이 JSON이 아닙니다(차단 추정).");
      return null;
    }
  }

  /** 홈페이지 HTML에 심긴 CSRF성 토큰. 없으면 GraphQL이 JSON 대신 로그인 셸을 준다. */
  private async resolveLsd(): Promise<string | null> {
    // 30분간 재사용한다.
    if (this.lsd && Date.now() - this.lsd.issuedAt < 30 * 60_000) {
      return this.lsd.token;
    }

    const html = await fetchInstagram("/", {
      headers: { Accept: "text/html", "X-IG-App-ID": APP_ID },
    });
    const token = html && /"LSD",\[\],\{"token":"([^"]+)"\}/.exec(html)?.[1];
    if (!token) {
      this.logger.warn("인스타 홈페이지에서 lsd 토큰을 찾지 못했습니다.");
      return null;
    }

    this.lsd = { token, issuedAt: Date.now() };
    return token;
  }
}

// errors/data 조합이 유동적이라 봉투는 스키마로 묶지 않는다.
// 실제 검증은 게시글 노드에 대해 PolarisMediaSchema가 수행한다.
interface PolarisGraphqlPayload {
  errors?: { message?: string }[];
  data?: {
    xig_polaris_media?: { if_not_gated_logged_out?: unknown } | null;
  };
}
