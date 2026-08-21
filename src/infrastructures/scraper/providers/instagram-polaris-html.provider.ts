import { Injectable, Logger } from "@nestjs/common";
import { SentryErrorReporter } from "../../sentry/sentry-reporter";
import { fetchInstagram } from "../instagram.util";
import type { InstagramProvider, ScrapedPost } from "../scraper.type";
import { toScrapedPost } from "./instagram-polaris.mapper";

/**
 * 2순위 — 게시글 페이지 HTML.
 *
 * polaris-json과 같은 노드를 주면서 doc_id·lsd·쿠키가 전혀 필요 없다. doc_id가
 * 교체되는 순간을 재배포 없이 넘기는 것이 이 경로의 존재 이유다.
 *
 * 실패했을 때 "게시글 없음"과 "차단"이 동일한 로그인 셸로 오므로 구분할 수 없다.
 * POST_NOT_FOUND로 단정하지 않고 다음 경로로 넘긴다.
 */
@Injectable()
export class InstagramPolarisHtmlProvider implements InstagramProvider {
  readonly name = "polaris-html" as const;

  private readonly logger = new Logger(InstagramPolarisHtmlProvider.name);

  constructor(private readonly reporter: SentryErrorReporter) {}

  async fetch(shortcode: string): Promise<ScrapedPost | null> {
    const html = await fetchInstagram(`/p/${shortcode}/`, {
      redirect: "follow",
      headers: { Accept: "text/html", "Upgrade-Insecure-Requests": "1" },
    });
    if (!html) return this.miss("request-failed", { shortcode });

    const node = extractMediaNode(html);
    // 원인(부재·차단·게이팅)을 구분할 수 없다. 크기는 셸 여부 추적용으로만 남긴다.
    if (!node) {
      return this.miss("no-media-node", { shortcode, bytes: html.length });
    }

    return toScrapedPost(node, (issues) =>
      this.miss("schema-mismatch", { shortcode, issues }),
    );
  }

  /** 다음 경로로 넘긴다. 경로별로 한 이슈에 묶이도록 Sentry 메시지는 고정한다. */
  private miss(reason: string, extra: Record<string, unknown>): null {
    const payload = { reason, ...extra };
    this.logger.warn(payload, "다음 경로로 넘긴다");
    this.reporter.report(new Error("인스타 스크래퍼 실패 — polaris-html"), {
      errorCode: "SCRAPER_PROVIDER_MISS",
      extra: payload,
    });
    return null;
  }
}

/**
 * HTML에서 `xig_polaris_media` 객체를 잘라내 게시글 노드를 반환한다.
 *
 * 중첩 객체는 정규식으로 다룰 수 없어 균형 괄호로 끊는다. 문자열 리터럴 안의 중괄호가
 * 깊이를 흐트러뜨리므로 따옴표 구간은 통째로 건너뛴다.
 */
function extractMediaNode(html: string): unknown {
  // Relay 프리페치 결과가 이 키로 심겨 온다.
  const key = '"xig_polaris_media":';
  const keyAt = html.indexOf(key);
  if (keyAt < 0) return null;

  const start = html.indexOf("{", keyAt + key.length);
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (char === '"') {
      while (++i < html.length && !(html[i] === '"' && html[i - 1] !== "\\"));
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try {
        const media = JSON.parse(html.slice(start, i + 1)) as {
          if_not_gated_logged_out?: unknown;
        };
        return media.if_not_gated_logged_out ?? null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
