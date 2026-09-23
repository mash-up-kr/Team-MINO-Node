import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { type File, Storage } from "@google-cloud/storage";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";
import { SentryErrorReporter } from "../sentry/sentry-reporter";
import type { StoredImage, StoredVideo } from "./place-image.type";

interface DownloadLimits {
  timeoutMs: number;
  maxBytes: number;
  supportedTypes: ReadonlySet<string>;
}

const IMAGE_LIMITS: DownloadLimits = {
  timeoutMs: 10_000,
  maxBytes: 20 * 1024 * 1024,
  supportedTypes: new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]),
};

/*
 * 릴스는 25초짜리가 14MB까지 나왔고, 로그아웃 응답의 렌디션 3종은 크기가 같아 저해상도
 * 대안이 없다. 1분 안팎까지 받아내려면 이미지보다 넉넉해야 한다.
 */
const VIDEO_LIMITS: DownloadLimits = {
  timeoutMs: 30_000,
  maxBytes: 50 * 1024 * 1024,
  supportedTypes: new Set(["video/mp4"]),
};

// 이미지 객체는 "000"부터 숫자라 이 이름과 겹치지 않는다.
const VIDEO_OBJECT_NAME = "video";

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
 * 인스타 게시글 이미지를 내려받아 GCS에 올리고, Vertex용 gs:// URI와 클라이언트용
 * 공개 https:// URL을 함께 돌려준다.
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
  private readonly videoBucketName: string;

  constructor(
    configService: ConfigService<Env>,
    private readonly reporter: SentryErrorReporter,
  ) {
    const project = configService.getOrThrow("GOOGLE_CLOUD_PROJECT", {
      infer: true,
    });
    const appEnv = configService.get("APP_ENV", { infer: true }) ?? "local";
    this.bucketName =
      configService.get("GCS_PLACE_IMAGES_BUCKET", { infer: true }) ??
      `team-mino-place-images-${appEnv}`;
    // 영상은 공개하지 않고 7일 뒤 지워지는 별도 버킷에 둔다(infra/storage.ts).
    this.videoBucketName =
      configService.get("GCS_PLACE_VIDEOS_BUCKET", { infer: true }) ??
      `team-mino-place-videos-${appEnv}`;
    this.storage = new Storage({ projectId: project });
  }

  /**
   * 게시글 이미지들을 병렬로 저장하고 저장된 이미지 목록을 반환한다.
   * 개별 이미지 실패는 건너뛰고(부분 성공 허용) 성공한 것만 필터링한다.
   */
  async storePostImages(
    shortcode: string,
    imageUrls: string[],
  ): Promise<StoredImage[]> {
    const allowed = this.selectAllowedImages(imageUrls);

    const results = await Promise.all(
      allowed.map(({ url, index }) => this.storeOne(shortcode, index, url)),
    );
    return results.filter((image): image is StoredImage => image !== null);
  }

  /**
   * 영상 게시글(릴스)의 원본 mp4를 올리고 gs:// URI를 돌려준다. 못 올리면 null.
   *
   * 이미지와 같은 이유로 GCS를 거친다 — Vertex는 인스타 CDN을 직접 읽지 못한다.
   * 실패해도 던지지 않는다. 캡션·썸네일만으로 추출하는 기존 경로가 그대로 받는다.
   */
  async storePostVideo(
    shortcode: string,
    videoUrl: string,
  ): Promise<StoredVideo | null> {
    if (!this.isAllowedHost(videoUrl)) {
      this.logger.warn(
        { host: this.hostOf(videoUrl) },
        "허용되지 않은 영상 호스트 — 스킵",
      );
      return null;
    }

    try {
      const objectName = `${SOURCE_PREFIX}/${shortcode}/${VIDEO_OBJECT_NAME}`;
      const file = this.storage.bucket(this.videoBucketName).file(objectName);
      const gsUri = `gs://${this.videoBucketName}/${objectName}`;

      const [exists] = await file.exists();
      if (exists) {
        const [metadata] = await file.getMetadata();
        return { gsUri, mediaType: metadata.contentType ?? "video/mp4" };
      }

      const mediaType = await this.streamToObject(videoUrl, file, VIDEO_LIMITS);
      return mediaType ? { gsUri, mediaType } : null;
    } catch (error) {
      this.logger.warn({ err: error, videoUrl }, "영상 저장 실패 — 스킵");
      return null;
    }
  }

  /**
   * 응답 본문을 메모리에 모으지 않고 GCS 객체로 바로 흘려보낸다. 저장된 MIME 타입을
   * 돌려주고, 못 올리면 null.
   *
   * 이미지는 20MB 상한이라 한 번에 받아도 되지만 영상은 다르다. 다 받은 뒤 크기를 재면
   * 상한을 넘는 영상도 일단 메모리에 전부 올라가고, 릴스 여러 건이 겹치면 256Mi에서
   * 바로 위험해진다. Content-Length로 먼저 거르고, 흘려보내는 중에도 바이트를 세어
   * 상한을 넘는 순간 끊는다.
   */
  private async streamToObject(
    mediaUrl: string,
    file: File,
    limits: DownloadLimits,
  ): Promise<string | null> {
    const response = await fetch(mediaUrl, {
      signal: AbortSignal.timeout(limits.timeoutMs),
      redirect: "error",
    });
    if (!response.ok || !response.body) {
      this.logger.warn(
        { mediaUrl, status: response.status },
        "미디어 다운로드 실패 — 스킵",
      );
      return null;
    }

    const mediaType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!limits.supportedTypes.has(mediaType)) {
      this.logger.warn(
        { mediaUrl, mediaType },
        "지원하지 않는 미디어 타입 — 스킵",
      );
      return null;
    }

    // 크기를 미리 알려주면 받기 전에 거른다. 없거나 거짓이면 아래에서 세며 거른다.
    const declared = Number(response.headers.get("content-length"));
    if (declared > limits.maxBytes) {
      this.logger.warn(
        { mediaUrl, bytes: declared },
        "미디어 크기 상한 초과 — 받지 않고 스킵",
      );
      return null;
    }

    let received = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.byteLength;
        if (received > limits.maxBytes) {
          callback(new Error(`미디어 크기 상한 초과 (${received} bytes)`));
          return;
        }
        callback(null, chunk);
      },
    });
    const writer = file.createWriteStream({
      resumable: false,
      contentType: mediaType,
    });

    try {
      // pipeline이 배압을 맡고, 어느 단계든 실패하면 나머지(fetch 본문 포함)를 함께 끊는다.
      await pipeline(
        Readable.fromWeb(
          // 런타임은 같은 스트림이지만 DOM 타입과 node:stream/web 타입이 갈려 있다.
          response.body as unknown as WebReadableStream<Uint8Array>,
        ),
        counter,
        writer,
      );
      return mediaType;
    } catch (error) {
      // 단일 요청 업로드라 끊기면 객체가 남지 않지만, 남았을 경우를 대비해 지운다.
      await file.delete({ ignoreNotFound: true }).catch(() => undefined);
      this.logger.warn(
        { err: error, mediaUrl, bytes: received },
        "미디어 스트리밍 실패 — 스킵",
      );
      return null;
    }
  }

  /**
   * 허용 호스트만 통과시키고, 거부된 것은 게시글 단위로 한 번 리포트한다.
   *
   * 인스타가 CDN 도메인을 바꾸면 모든 URL이 걸려 이미지 0장으로 "성공"한다. 캡션만으로
   * 추출이 계속되므로 에러 없이 품질만 떨어져 아무도 눈치채지 못한다. 이미지 수만큼 이벤트가
   * 쌓이지 않도록 게시글당 한 번만 보낸다.
   *
   * index는 원본 배열 기준을 유지한다. 객체 경로에 쓰이므로 거른 뒤 다시 매기면 같은
   * 게시글이 다른 경로에 쌓여 멱등성이 깨진다.
   */
  private selectAllowedImages(
    imageUrls: string[],
  ): { url: string; index: number }[] {
    const allowed: { url: string; index: number }[] = [];
    // 서명 URL에는 토큰이 붙으므로 전체 URL 대신 호스트만 남긴다.
    const rejectedHosts = new Set<string>();
    let rejected = 0;

    imageUrls.forEach((url, index) => {
      if (this.isAllowedHost(url)) {
        allowed.push({ url, index });
        return;
      }
      rejectedHosts.add(this.hostOf(url));
      rejected += 1;
    });

    if (rejected > 0) {
      const extra = {
        hosts: [...rejectedHosts],
        disallowed: rejected,
        total: imageUrls.length,
      };
      this.logger.error(extra, "허용되지 않은 이미지 호스트 — 스킵");
      this.reporter.report(
        // 호스트가 바뀌어도 Sentry에서 한 이슈로 묶이도록 메시지를 고정한다.
        new Error("허용되지 않은 이미지 호스트"),
        { errorCode: "IMAGE_HOST_NOT_ALLOWED", extra },
      );
    }

    return allowed;
  }

  private hostOf(imageUrl: string): string {
    try {
      return new URL(imageUrl).hostname.toLowerCase();
    } catch {
      return "invalid-url";
    }
  }

  /** 호스트 검증을 통과한 URL만 받는다(selectAllowedImages 참고). */
  private async storeOne(
    shortcode: string,
    index: number,
    imageUrl: string,
  ): Promise<StoredImage | null> {
    try {
      const paddedIndex = String(index).padStart(INDEX_DIGITS, "0");
      const objectName = `${SOURCE_PREFIX}/${shortcode}/${paddedIndex}`;
      const file = this.storage.bucket(this.bucketName).file(objectName);
      const gsUri = `gs://${this.bucketName}/${objectName}`;
      const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${objectName}`;

      // 이미 올린 게시글이면 다시 받지 않고 저장된 타입만 읽어 재사용한다(멱등).
      const [exists] = await file.exists();
      if (exists) {
        const [metadata] = await file.getMetadata();
        return {
          gsUri,
          publicUrl,
          mediaType: metadata.contentType ?? "image/jpeg",
        };
      }

      const downloaded = await this.download(imageUrl, IMAGE_LIMITS);
      if (!downloaded) return null;

      await file.save(downloaded.bytes, {
        contentType: downloaded.mediaType,
        resumable: false,
      });
      return { gsUri, publicUrl, mediaType: downloaded.mediaType };
    } catch (error) {
      this.logger.warn({ err: error, imageUrl }, "이미지 저장 실패 — 스킵");
      return null;
    }
  }

  private async download(
    mediaUrl: string,
    limits: DownloadLimits,
  ): Promise<{ bytes: Uint8Array; mediaType: string } | null> {
    /*
     * 리다이렉트를 따라가면 허용 호스트가 임의 주소로 넘길 수 있어(SSRF) allowlist가 무력화된다.
     * 인스타 CDN은 이미지를 직접 응답하므로 리다이렉트를 거부한다.
     */
    const response = await fetch(mediaUrl, {
      signal: AbortSignal.timeout(limits.timeoutMs),
      redirect: "error",
    });
    if (!response.ok) {
      this.logger.warn(
        { mediaUrl, status: response.status },
        "미디어 다운로드 실패 — 스킵",
      );
      return null;
    }

    const mediaType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!limits.supportedTypes.has(mediaType)) {
      this.logger.warn(
        { mediaUrl, mediaType },
        "지원하지 않는 미디어 타입 — 스킵",
      );
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limits.maxBytes) {
      this.logger.warn(
        { mediaUrl, bytes: bytes.byteLength },
        "미디어 크기 상한 초과 — 스킵",
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
