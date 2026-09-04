import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { InvitationService } from "../invitation/invitation.service";
import { AppLinkConfig } from "./app-link.config";
import { INVITE_PATH_COMPONENT, INVITE_PATH_PREFIX } from "./app-link.constant";
import type {
  AndroidAssetLink,
  AppleAppSiteAssociation,
  LandingView,
} from "./app-link.type";

@Injectable()
export class AppLinkService {
  constructor(
    private readonly config: AppLinkConfig,
    private readonly invitationService: InvitationService,
  ) {}

  /** 준비된 iOS 식별자가 없으면 undefined. 컨트롤러가 404로 바꾼다. */
  appleAppSiteAssociation(): AppleAppSiteAssociation | undefined {
    if (!this.config.hasApple) return undefined;

    return {
      applinks: {
        details: [
          {
            appIDs: this.config.appleAppIds,
            components: [{ "/": INVITE_PATH_COMPONENT }],
          },
        ],
      },
    };
  }

  /**
   * 준비된 Android 식별자가 없으면 undefined. 컨트롤러가 404로 바꾼다.
   *
   * 패키지마다 엔트리를 하나씩 만든다. 디버그 빌드의 applicationId가 배포와 다르면
   * 지문을 한 엔트리에 몰아넣어도 검증되지 않기 때문이다.
   */
  assetLinks(): AndroidAssetLink[] | undefined {
    const appLinks = this.config.androidAppLinks;
    if (appLinks.length === 0) return undefined;

    return appLinks.map(({ packageName, fingerprints }) => ({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    }));
  }

  /**
   * 코드가 유효하지 않아도 페이지는 그린다. 방 정보만 비우고 버튼은 그대로 둬서
   * 앱이 설치돼 있으면 앱으로 넘긴다. 앱은 어차피 이 경우를 처리해야 한다 —
   * 설치자가 링크를 직접 누르면 OS가 코드 검증 없이 앱을 열기 때문이다.
   *
   * 다만 삼키는 건 코드가 잘못된 경우(4xx)뿐이다. DB 장애 같은 5xx까지 삼키면
   * 장애가 "없는 초대"로 둔갑해 사용자에게도 Sentry에도 드러나지 않는다.
   */
  async landing(code: string): Promise<LandingView> {
    return {
      code,
      // 인증 없이 열리는 미리보기(PRD: 앱 설치 전 진입)를 그대로 재사용한다.
      invitation: await this.invitationService
        .preview(code)
        .then((preview) => ({
          roomName: preview.room.name,
          roomDescription: preview.room.description,
          inviterNickname: preview.inviter.nickname,
          pinCount: preview.room.pinCount,
          memberCount: preview.room.memberCount,
        }))
        .catch((error: unknown) => {
          if (isClientError(error)) return undefined;

          throw error;
        }),
      iosAppUrl: this.iosAppUrl(code),
      androidAppUrl: this.androidIntentUrl(code),
      appStoreUrl: this.appStoreUrl(),
      playStoreUrl: this.playStoreUrl(code),
      ogImageUrl: this.config.ogImageUrl,
    };
  }

  /** 초대 링크 원본. OG의 og:url과 "링크 다시 누르기" 안내가 가리키는 주소다. */
  inviteUrl(code: string): string {
    return `${this.config.webOrigin}${INVITE_PATH_PREFIX}${code}`;
  }

  /**
   * iOS "앱에서 열기".
   *
   * 유니버설 링크(https)를 쓸 수 없다. 카카오톡 인앱 브라우저는 유니버설 링크를
   * 발동시키지 않고, 같은 도메인 페이지 안에서의 클릭도 iOS가 가로채지 않는다.
   * 커스텀 스킴만 확실하게 앱을 연다.
   *
   * 대신 앱이 없으면 Safari가 오류 알림을 띄우므로, 랜딩에서는 설치 버튼을
   * 주 버튼으로 두고 이 버튼은 보조로 배치한다.
   */
  private iosAppUrl(code: string): string {
    return `${this.config.iosScheme}://r/${code}`;
  }

  /**
   * Android "앱에서 열기".
   *
   * scheme=https로 감싸 기존 App Links를 그대로 태운다. 커스텀 스킴을 새로
   * 등록할 필요가 없고, package=를 명시해 링크 검증이 실패한 상태에서도 앱이 열린다.
   *
   * browser_fallback_url에는 **반드시 referrer가 붙은** 스토어 주소를 넣는다.
   * 이 버튼으로 설치한 사용자는 Play Install Referrer로만 초대 코드를 복원할 수
   * 있어서, referrer가 빠지면 설치 직후 어느 방으로 보낼지 알 수 없게 된다.
   *
   * 인코딩이 두 겹인 점에 주의한다.
   *   code=XL9AJC → referrer 값: code%3DXL9AJC → fallback 안: code%253DXL9AJC
   * playStoreUrl()이 한 겹, encodeURIComponent가 나머지 한 겹을 담당한다.
   */
  private androidIntentUrl(code: string): string | undefined {
    const packageName = this.config.androidPackageName;
    const fallbackUrl = this.playStoreUrl(code);
    if (!packageName || !fallbackUrl) return undefined;

    const host = new URL(this.config.webOrigin).host;

    return [
      `intent://${host}${INVITE_PATH_PREFIX}${code}#Intent`,
      "scheme=https",
      `package=${packageName}`,
      `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`,
      "end",
    ].join(";");
  }

  /**
   * Play Store 주소. referrer로 초대 코드를 실어 보낸다.
   * 앱은 최초 실행 때 Play Install Referrer API로 이 값을 읽어 코드를 복원한다.
   */
  private playStoreUrl(code: string): string | undefined {
    const packageName = this.config.androidPackageName;
    if (!packageName) return undefined;

    const referrer = encodeURIComponent(`code=${code}`);

    return `https://play.google.com/store/apps/details?id=${packageName}&referrer=${referrer}`;
  }

  /**
   * App Store 주소.
   *
   * iOS에는 Install Referrer에 해당하는 공식 수단이 없다(Firebase Dynamic Links
   * 2025-08 종료). 그래서 설치 후 코드를 되찾는 경로는 "초대 링크를 다시 누르기"뿐이고,
   * 랜딩이 그 안내를 담당한다.
   */
  private appStoreUrl(): string | undefined {
    const appStoreId = this.config.appStoreId;
    if (!appStoreId) return undefined;

    return `https://apps.apple.com/app/id${appStoreId}`;
  }
}

/** 초대 코드 자체가 잘못됐다는 뜻의 오류인지. 그 외는 우리 쪽 장애다. */
function isClientError(error: unknown): boolean {
  return (
    error instanceof HttpException &&
    error.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR
  );
}
