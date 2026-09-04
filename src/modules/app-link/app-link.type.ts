/**
 * https://gguk.org/.well-known/apple-app-site-association 응답 형태.
 *
 * iOS 13+ 형식(`details[].appIDs` + `components`)을 쓴다. 예전 형식의
 * `apps` / `paths`는 넣지 않는다.
 *
 * 서빙 조건(앱팀 확인 사항 — 하나라도 어긋나면 OS가 파일을 무시한다):
 *   · 파일명에 확장자를 붙이지 않는다 (`.json` 금지)
 *   · Content-Type: application/json
 *   · 리다이렉트 없이 200으로 직접 응답
 */
export type AppleAppSiteAssociation = {
  applinks: {
    details: {
      /** `{TeamID}.{BundleID}` 형태. dev/staging 번들이 있으면 함께 넣는다. */
      appIDs: string[];
      /** 앱이 가져갈 경로. 초대 링크는 `/r/*` 하나다. */
      components: { "/": string }[];
    }[];
  };
};

/**
 * https://gguk.org/.well-known/assetlinks.json 응답 형태.
 *
 * 배열 하나에 앱 하나. 지문(sha256_cert_fingerprints)은 여러 개를 넣을 수 있고,
 * 넣어야 한다 — 서명 키마다 지문이 달라서다.
 */
export type AndroidAssetLink = {
  relation: ["delegate_permission/common.handle_all_urls"];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

/**
 * 랜딩 페이지 렌더링에 필요한 값.
 *
 * `invitation`은 코드가 유효할 때만 채워진다. 무효한 코드에도 같은 버튼을 그려
 * 앱으로 보낼 수 있게 하려는 것이다 — 앱이 설치돼 있으면 그쪽이 훨씬 나은 에러
 * 화면을 갖고 있고, 어차피 앱은 이 경우를 처리해야 한다(앱 설치자가 링크를
 * 직접 누르면 OS가 코드 검증 없이 앱을 열기 때문이다).
 */
export type LandingView = {
  code: string;
  invitation:
    | {
        roomName: string;
        roomDescription: string | null;
        inviterNickname: string;
        pinCount: number;
        memberCount: number;
      }
    | undefined;
  /** iOS 커스텀 스킴. 인앱 브라우저에서 앱을 여는 용도. */
  iosAppUrl: string;
  /** Android intent://. App Links를 그대로 타면서 미설치 시 스토어로 폴백한다. */
  androidAppUrl: string | undefined;
  appStoreUrl: string | undefined;
  playStoreUrl: string | undefined;
  /**
   * 카카오톡·인스타 공유 카드 이미지. 없으면 이미지 없는 텍스트 카드가 뜬다.
   * 디자인에서 받은 배너를 OG_IMAGE_URL로 넣는다. 방 색상별로 나누고 싶으면
   * room.color를 키로 매핑을 추가하면 되지만, 우선 한 장으로 시작한다.
   */
  ogImageUrl: string | undefined;
};
