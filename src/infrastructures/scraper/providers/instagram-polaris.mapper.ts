import * as v from "valibot";
import { toScrapedTypename } from "../instagram.util";
import type { ScrapedPost } from "../scraper.type";
import {
  type PolarisMedia,
  PolarisMediaSchema,
} from "./instagram-polaris.type";

/**
 * Polaris 원본 노드(`xig_polaris_media.if_not_gated_logged_out`)를 ScrapedPost로 변환한다.
 *
 * 구조가 어긋나면 던지지 않고 `logMismatch`로 알린 뒤 null을 준다 — 호출한 provider가
 * 인스타의 스키마 변경을 추적하면서 다음 경로로 넘길 수 있어야 하기 때문이다.
 */
export function toScrapedPost(
  node: unknown,
  logMismatch: (issues: Record<string, unknown>) => void,
): ScrapedPost | null {
  const parsed = v.safeParse(PolarisMediaSchema, node);
  if (!parsed.success) {
    logMismatch(v.flatten(parsed.issues).nested ?? {});
    return null;
  }

  const media = parsed.output;
  const typename = toScrapedTypename(media.__typename);
  const imageUrls = toImageUrls(media);
  if (!typename || imageUrls.length === 0) {
    logMismatch({ __typename: media.__typename, imageCount: imageUrls.length });
    return null;
  }

  const { location } = media;
  return {
    shortcode: media.code,
    typename,
    caption: media.caption?.text ?? null,
    imageUrls,
    owner: {
      id: String(media.user.pk),
      username: media.user.username,
      fullName: media.user.full_name,
    },
    location: location
      ? {
          id: String(location.pk),
          name: location.name,
          lat: location.lat ?? null,
          lng: location.lng ?? null,
        }
      : null,
  };
}

// 캐러셀이면 각 자식의, 아니면 대표 이미지(영상은 썸네일) 1장의 원본 URL.
// display_uri는 640px로 축소된 별개 필드라 쓰지 않는다.
function toImageUrls(media: PolarisMedia): string[] {
  const children = media.carousel_media;
  if (children?.length) {
    return children.map((child) => child.image_versions2.candidates[0].url);
  }
  const url = media.image_versions2?.candidates[0]?.url;
  return url ? [url] : [];
}
