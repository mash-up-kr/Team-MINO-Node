import { Storage } from "@google-cloud/storage";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";
import type { StoredImage } from "./place-image.type";

const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const SUPPORTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/*
 * 이미지 URL은 인스타 GraphQL 응답에서 오므로 우리 서버가
 * 임의 URL을 fetch하지 않도록(SSRF 방지) 호스트를 제한한다.
 */
const ALLOWED_IMAGE_HOST_SUFFIXES = [".cdninstagram.com", ".fbcdn.net"];

/*
 * 객체 경로의 출처 접두사. 이후 다른 출처(네이버 지도 등)가 추가돼도 식별자 체계가
 * 버킷 루트에서 섞이지 않도록 출처별로 구분한다.
 */
const SOURCE_PREFIX = "instagram";

/*
 * 객체 이름의 인덱스 자릿수. GCS 목록은 사전순이라 패딩이 없으면 10이 2보다 앞서 캐러셀
 * 순서가 뒤섞인다. 고정 자릿수로 맞춰 사전순과 숫자순을 일치시킨다.
 */
const INDEX_DIGITS = 3;

/**
 * 인스타 게시글 이미지를 내려받아 GCS에 올리고 gs:// URI를 돌려준다.
 *
 * Vertex Gemini는 인스타 CDN 이미지를 URL로 직접 읽지 못한다(인스타 robots.txt가
 * 크롤러를 차단). 대신 같은 프로젝트의 GCS 객체는 robots 검사 없이 읽으므로, 앱이 한 번
 * 받아 올린 뒤 gs://로 넘긴다. 객체 경로는 출처/shortcode 기준이라 같은 게시글 재요청 시 재사용된다.
 */
@Injectable()
export class PlaceImageService {
  private readonly logger = new Logger(PlaceImageService.name);
  private readonly storage: Storage;
  private readonly bucketName: string;

  constructor(configService: ConfigService<Env>) {
    const project = configService.getOrThrow("GOOGLE_CLOUD_PROJECT", {
      infer: true,
    });
    const appEnv = configService.get("APP_ENV", { infer: true }) ?? "local";
    this.bucketName =
      configService.get("GCS_PLACE_IMAGES_BUCKET", { infer: true }) ??
      `team-mino-place-images-${appEnv}`;
    this.storage = new Storage({ projectId: project });
  }

  /**
   * 게시글 이미지들을 병렬로 저장하고 gs:// URI 목록을 반환한다.
   * 개별 이미지 실패는 건너뛰고(부분 성공 허용) 성공한 것만 필터링한다.
   */
  async storePostImages(
    shortcode: string,
    imageUrls: string[],
  ): Promise<StoredImage[]> {
    const results = await Promise.all(
      imageUrls.map((url, index) => this.storeOne(shortcode, index, url)),
    );
    return results.filter((image): image is StoredImage => image !== null);
  }

  private async storeOne(
    shortcode: string,
    index: number,
    imageUrl: string,
  ): Promise<StoredImage | null> {
    try {
      if (!this.isAllowedHost(imageUrl)) {
        this.logger.warn({ imageUrl }, "허용되지 않은 이미지 호스트 — 스킵");
        return null;
      }

      const paddedIndex = String(index).padStart(INDEX_DIGITS, "0");
      const objectName = `${SOURCE_PREFIX}/${shortcode}/${paddedIndex}`;
      const file = this.storage.bucket(this.bucketName).file(objectName);
      const gsUri = `gs://${this.bucketName}/${objectName}`;

      // 이미 올린 게시글이면 다시 받지 않고 저장된 타입만 읽어 재사용한다(멱등).
      const [exists] = await file.exists();
      if (exists) {
        const [metadata] = await file.getMetadata();
        return { gsUri, mediaType: metadata.contentType ?? "image/jpeg" };
      }

      const downloaded = await this.download(imageUrl);
      if (!downloaded) return null;

      await file.save(downloaded.bytes, {
        contentType: downloaded.mediaType,
        resumable: false,
      });
      return { gsUri, mediaType: downloaded.mediaType };
    } catch (error) {
      this.logger.warn({ err: error, imageUrl }, "이미지 저장 실패 — 스킵");
      return null;
    }
  }

  private async download(
    imageUrl: string,
  ): Promise<{ bytes: Uint8Array; mediaType: string } | null> {
    /*
     * 리다이렉트를 따라가면 허용 호스트가 임의 주소로 넘길 수 있어(SSRF) allowlist가 무력화된다.
     * 인스타 CDN은 이미지를 직접 응답하므로 리다이렉트를 거부한다.
     */
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: "error",
    });
    if (!response.ok) {
      this.logger.warn(
        { imageUrl, status: response.status },
        "이미지 다운로드 실패 — 스킵",
      );
      return null;
    }

    const mediaType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
      this.logger.warn(
        { imageUrl, mediaType },
        "지원하지 않는 이미지 타입 — 스킵",
      );
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      this.logger.warn(
        { imageUrl, bytes: bytes.byteLength },
        "이미지 크기 상한 초과 — 스킵",
      );
      return null;
    }

    return { bytes, mediaType };
  }

  private isAllowedHost(imageUrl: string): boolean {
    let host: string;
    try {
      const parsed = new URL(imageUrl);
      if (parsed.protocol !== "https:") return false;
      host = parsed.hostname.toLowerCase();
    } catch {
      return false;
    }
    return ALLOWED_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  }
}
