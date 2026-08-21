import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../../common/exceptions/app.exception";
import type { ScrapedPost } from "../scraper.type";

/** 임베드 경로로 전체 데이터를 확보하지 못해 폴백이 필요한 이유. */
export type InstagramFallbackReason =
  // 임베드 페이지가 게시글 노출 자체를 거부 (삭제/비공개/연령제한/임베드 차단 계정)
  | "EMBED_BLOCKED"
  // 캐러셀인데 contextJSON이 없어 전체 이미지를 확보할 수 없음
  | "CAROUSEL_DATA_MISSING";

/**
 * 임베드 페이지로 전체 데이터를 확보할 수 없는 게시글을 처리하는 2차 스크래퍼 경계.
 *
 * 캐러셀 뒷장에만 장소가 담긴 게시글(맛집 모음류)에서 첫 장만으로 "성공" 처리하면
 * AI 추출 품질이 에러 없이 조용히 떨어진다. 그래서 전체 이미지를 확보하지 못한
 * 경우는 부분 성공 대신 이 경계로 넘긴다. 지금은 미구현(Noop)이라 명시적 실패로
 * 끝나고, 추후 관리형 스크래핑 API(SaaS) 구현으로 교체한다.
 */
export abstract class InstagramFallbackFetcher {
  abstract fetchPost(
    shortcode: string,
    reason: InstagramFallbackReason,
  ): Promise<ScrapedPost>;
}

/** 폴백 미구성 상태 — 어중간한 부분 성공 대신 이유별 명시적 실패를 던진다. */
@Injectable()
export class NoopInstagramFallbackFetcher extends InstagramFallbackFetcher {
  async fetchPost(
    _shortcode: string,
    reason: InstagramFallbackReason,
  ): Promise<ScrapedPost> {
    if (reason === "EMBED_BLOCKED") {
      throw new AppException(
        "POST_NOT_FOUND",
        "게시글을 찾을 수 없습니다. (삭제되었거나 비공개·연령제한일 수 있습니다)",
        HttpStatus.NOT_FOUND,
      );
    }
    throw new AppException(
      "SCRAPER_REQUEST_FAILED",
      "캐러셀 게시글의 전체 이미지를 가져올 수 없습니다.",
      HttpStatus.BAD_GATEWAY,
    );
  }
}
