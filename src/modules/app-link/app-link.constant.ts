/**
 * 초대 링크 경로. 이 값은 네 곳이 동시에 같아야 한다.
 *   1. 여기 (웹 라우트)
 *   2. AASA의 components `/r/*`
 *   3. Android 매니페스트의 intent-filter pathPrefix `/r/`
 *   4. 클라이언트가 조립하는 공유 링크
 * 한 곳만 바꾸면 링크가 조용히 앱으로 안 열린다.
 */
export const INVITE_PATH_PREFIX = "/r/";

/** AASA components에 쓰는 와일드카드 형태. */
export const INVITE_PATH_COMPONENT = "/r/*";

/** `.well-known` 경로. RFC 8615 고정 위치라 바꿀 수 없다. */
export const WELL_KNOWN_PREFIX = ".well-known";

/**
 * AASA는 확장자 없이 이 이름 그대로여야 하고, Content-Type이 application/json이어야 하며,
 * 리다이렉트 없이 200으로 응답해야 한다. 셋 중 하나만 어긋나도 iOS가 파일을 무시한다.
 */
export const APPLE_APP_SITE_ASSOCIATION = "apple-app-site-association";

export const ANDROID_ASSET_LINKS = "assetlinks.json";
