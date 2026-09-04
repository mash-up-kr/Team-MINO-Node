import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";

/**
 * 초대 링크(유니버설 링크 / App Links)에 필요한 앱 식별자 모음.
 *
 * 값의 출처가 전부 앱팀이라 env로 받는다. 어느 값이 어디서 오는지는
 * env.schema.ts의 각 항목 주석에 적어 두었다.
 *
 * 아직 받지 못한 값이 있으면 해당 플랫폼의 `.well-known` 응답이 404가 된다.
 * 그 상태의 도메인은 "이 앱을 아직 인정하지 않는다"는 뜻이라 OS 동작과도 일치한다.
 */
@Injectable()
export class AppLinkConfig {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  /** 초대 링크가 올라가는 웹 오리진. 예: https://gguk.org */
  get webOrigin(): string {
    return this.configService.get("APP_WEB_ORIGIN", { infer: true });
  }

  /**
   * AASA의 appIDs에 들어갈 `{TeamID}.{BundleID}` 목록.
   * dev/staging 번들이 따로 있으면 전부 포함해야 그 빌드에서도 링크가 열린다.
   */
  get appleAppIds(): string[] {
    const teamId = this.configService.get("IOS_TEAM_ID", { infer: true });
    const bundleIds = this.configService.get("IOS_BUNDLE_IDS", { infer: true });
    if (!teamId || !bundleIds) return [];

    return bundleIds
      .split(",")
      .map((bundleId) => bundleId.trim())
      .filter(Boolean)
      .map((bundleId) => `${teamId}.${bundleId}`);
  }

  /** Android 패키지명. assetlinks.json과 intent:// 링크의 package= 양쪽에 쓴다. */
  get androidPackageName(): string | undefined {
    return this.configService.get("ANDROID_PACKAGE_NAME", { infer: true });
  }

  /**
   * assetlinks.json에 넣을 (패키지, 지문) 쌍 목록.
   *
   * Digital Asset Links는 한 엔트리에 패키지를 하나만 담는다. 디버그 빌드의
   * applicationId가 배포와 다르면 지문을 배포 엔트리에 더하는 것으로는 부족하고,
   * 패키지별로 엔트리가 따로 있어야 그 빌드의 App Links가 검증된다.
   */
  get androidAppLinks(): { packageName: string; fingerprints: string[] }[] {
    const candidates = [
      {
        packageName: this.androidPackageName,
        fingerprints: this.fingerprints("ANDROID_SHA256_FINGERPRINTS"),
      },
      {
        packageName: this.configService.get("ANDROID_DEBUG_PACKAGE_NAME", {
          infer: true,
        }),
        fingerprints: this.fingerprints("ANDROID_DEBUG_SHA256_FINGERPRINTS"),
      },
    ];

    return candidates.filter(
      (
        candidate,
      ): candidate is { packageName: string; fingerprints: string[] } =>
        candidate.packageName !== undefined &&
        candidate.fingerprints.length > 0,
    );
  }

  private fingerprints(
    key: "ANDROID_SHA256_FINGERPRINTS" | "ANDROID_DEBUG_SHA256_FINGERPRINTS",
  ): string[] {
    const raw = this.configService.get(key, { infer: true });
    if (!raw) return [];

    return raw
      .split(",")
      .map((fingerprint) => fingerprint.trim().toUpperCase())
      .filter(Boolean);
  }

  /** iOS 커스텀 스킴. 인앱 브라우저에서 "앱에서 열기"를 실행하는 유일한 수단이다. */
  get iosScheme(): string {
    return this.configService.get("IOS_URL_SCHEME", { infer: true });
  }

  /**
   * 공유 카드 이미지 URL. 디자인에서 받은 배너를 그대로 넣는다.
   * 카카오톡이 OG를 캐싱하므로 배포 전에 채워 두는 편이 낫다.
   */
  get ogImageUrl(): string | undefined {
    return this.configService.get("OG_IMAGE_URL", { infer: true });
  }

  /** App Store 숫자 ID. 스토어 링크 조립에 쓴다. */
  get appStoreId(): string | undefined {
    return this.configService.get("IOS_APP_STORE_ID", { infer: true });
  }

  /** iOS 식별자가 준비됐는지. 준비 안 됐으면 `.well-known`을 내보내지 않는다. */
  get hasApple(): boolean {
    return this.appleAppIds.length > 0;
  }
}
