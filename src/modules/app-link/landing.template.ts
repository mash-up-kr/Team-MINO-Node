import type { LandingView } from "./app-link.type";

/** 정적 파일 경로. Cloud Run이 public/을 서빙한다(config/static-assets.ts). */
const ASSETS = {
  avatar: "/img/avatar.png",
  invitation: "/img/invitation.png",
  character: "/img/character.png",
  // SVG도 있지만 쓰지 않는다. apple-touch-icon이 PNG만 받아 어차피 PNG가 필요하다.
  favicon: "/img/favicon.png",
} as const;

/** 형식이 틀린 코드(400)와 없는 코드(200)는 같은 상황으로 보이므로 화면을 공유한다. */
const INVALID_LINK_TITLE = "이 초대 링크는\n사용할 수 없어요.";
const INVALID_LINK_DESCRIPTION =
  "코드가 만료됐거나 유효하지 않아요.\n친구에게 새 링크를 요청해보세요.";

/** 5xx만 우리 쪽 장애다. 4xx는 링크가 잘못된 경우라 문구가 다르다. */
const SERVER_ERROR_STATUS = 500;

/**
 * 디자인 시안(Figma 랜딩페이지_초대장 / _오류)에서 옮긴 값.
 *
 * 다크 모드는 쓰지 않는다. 일러스트가 검은 선 그림이라 반전되면 보이지 않는다.
 */
const BASE_STYLE = `
  @font-face { font-family: SUITE; font-weight: 400; font-display: swap;
    src: url("/fonts/SUITE-Regular.woff2") format("woff2"); }
  @font-face { font-family: SUITE; font-weight: 500; font-display: swap;
    src: url("/fonts/SUITE-Medium.woff2") format("woff2"); }
  @font-face { font-family: SUITE; font-weight: 700; font-display: swap;
    src: url("/fonts/SUITE-Bold.woff2") format("woff2"); }

  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100dvh;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #fff;
    color: #000;
    font-family: SUITE, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
    text-align: center;
    -webkit-text-size-adjust: 100%;
  }
  /*
   * 시안 프레임(375x812)을 한 덩어리로 두고 가운데 놓는다. height가 아니라
   * min-height여야 내용이 길 때 잘리지 않고 페이지가 스크롤된다.
   */
  .frame {
    width: 100%;
    max-width: 375px;
    min-height: min(100dvh, 812px);
    padding: 0 20px calc(20px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  /* 여백은 시안에서 잰 값이고 두 화면이 다르다. 골격은 공유하고 이 둘만 바꾼다. */
  main { --content-top: 128px; --content-gap: 46px;
    width: 100%; max-width: 335px; flex: 1; padding-top: var(--content-top);
    display: flex; flex-direction: column; align-items: center; }
  main.error { --content-top: 126px; --content-gap: 71px; }

  .avatar { width: 40px; height: 40px; border-radius: 50%; margin-bottom: 12px;
    border: 1px solid rgba(112, 115, 124, 0.08); }
  h1 { margin: 0; font-weight: 700; font-size: 24px; line-height: 32px; letter-spacing: -0.55px; }
  /*
   * 너비가 아니라 높이를 고정한다. 내보낸 PNG가 선 굵기만큼 가로로 넓어서,
   * 너비를 시안 값에 맞추면 세로가 줄고 아래 문구가 따라 올라간다.
   */
  .art { margin: var(--content-gap) 0 0; height: 243px; width: auto; max-width: 100%; }
  .art.narrow { height: 252px; }
  .desc { margin: var(--content-gap) 0 0; font-weight: 500; font-size: 20px; line-height: 28px;
    letter-spacing: -0.24px; color: rgba(46, 47, 51, 0.88); }
  .desc.muted { color: rgba(55, 56, 60, 0.61); }

  .actions { width: 100%; max-width: 335px; margin-top: auto; padding-top: 40px; }
  .button {
    display: flex; align-items: center; justify-content: center;
    width: 100%; height: 48px; border-radius: 12px;
    border: 0; background: none; cursor: pointer; text-decoration: none;
    font-family: inherit; font-weight: 700; font-size: 16px; line-height: 24px; letter-spacing: 0.09px;
  }
  .button.primary { background: #000; color: #fff; }
  .button.secondary { border: 1px solid rgba(112, 115, 124, 0.16); color: #000; }
  .button[disabled] { opacity: 0.6; }

  /* display를 지정하면 안 된다. hidden 속성의 display: none을 덮어써 안 숨겨진다. */
  .overlay { position: fixed; inset: 0; background: rgba(23, 23, 25, 0.52); z-index: 1; }
  /* 시안이 정중앙보다 3px 위라 반지름 14에 3을 더한다. */
  .spinner {
    position: absolute; top: 50%; left: 50%; margin: -17px 0 0 -14px;
    width: 28px; height: 28px; border-radius: 50%;
    border: 3px solid #e1e2e4; border-right-color: transparent;
    animation: spin 0.8s linear infinite;
  }
  /* 스피너 아래 16px: 중앙에서 -3 + 반지름 14 + 간격 16. */
  .loading-text {
    position: absolute; top: calc(50% + 27px); left: 0; right: 0; margin: 0;
    font-weight: 700; font-size: 20px; line-height: 28px; letter-spacing: -0.24px;
    color: #fff;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 시안의 줄바꿈을 <br>로 살린다. */
function multiline(value: string): string {
  return value.split("\n").map(escapeHtml).join("<br>");
}

/**
 * 두 페이지가 공유하는 골격.
 *
 * `head`와 `body`는 이스케이프하지 않는다. 사용자 입력을 넣는 호출부가 escapeHtml을
 * 거치는 책임을 진다.
 */
function renderPage(page: {
  title: string;
  head?: string;
  body: string;
  script?: string;
}): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(page.title)}</title>
<link rel="icon" href="${ASSETS.favicon}" sizes="180x180">
<link rel="apple-touch-icon" href="${ASSETS.favicon}">
${page.head ?? ""}
<style>${BASE_STYLE}</style>
</head>
<body>
<div class="frame">
${page.body}
</div>
</body>
${page.script ?? ""}
</html>`;
}

/**
 * 초대 랜딩 페이지.
 *
 * 여기 도달했다는 건 "앱이 안 열렸다"는 뜻이지 "앱이 없다"는 뜻이 아니다. 카카오톡·
 * 인스타그램 인앱 브라우저는 App Links를 발동시키지 않아 설치자도 대부분 여기로 온다.
 * 그래서 버튼 하나가 앱 열기와 설치를 겸한다.
 *
 * 코드 유효 여부와 무관하게 noindex다. 초대 코드 자체가 방의 접근 권한이라(PRD 4장)
 * 색인되면 링크를 받지 않은 사람도 검색으로 들어올 수 있다.
 */
export function renderLanding(view: LandingView, inviteUrl: string): string {
  const invitation = view.invitation;
  const title = invitation
    ? `${invitation.inviterNickname}님이\n공동방에 초대했어요`
    : INVALID_LINK_TITLE;
  const description = invitation
    ? "앱 설치 후 아래의 버튼을 눌러주시면\n초대된 방으로 이동해요"
    : INVALID_LINK_DESCRIPTION;
  const flatTitle = title.replaceAll("\n", " ");

  return renderPage({
    title: flatTitle,
    head: `<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(flatTitle)}">
<meta property="og:description" content="${escapeHtml(ogDescription(view))}">
<meta property="og:url" content="${escapeHtml(inviteUrl)}">
${previewMetaTags(view, flatTitle)}
<meta name="robots" content="noindex">`,
    body: `<main${invitation ? "" : ' class="error"'}>
${invitation ? `  <img class="avatar" src="${ASSETS.avatar}" alt="" width="40" height="40">\n` : ""}  <h1>${multiline(title)}</h1>
  ${invitation ? `<img class="art" src="${ASSETS.invitation}" alt="" width="498" height="485">` : characterArt()}
  <p class="desc${invitation ? "" : " muted"}">${multiline(description)}</p>
</main>
<div class="actions">
  <button class="button ${invitation ? "primary" : "secondary"}" id="cta"
    data-app="${escapeHtml(view.iosAppUrl)}"
    data-android="${escapeHtml(view.androidAppUrl ?? "")}"
    data-store="${escapeHtml(view.appStoreUrl ?? view.playStoreUrl ?? inviteUrl)}">${invitation ? "참가하기" : "꾹으로 이동하기"}</button>
</div>
<div class="overlay" id="loading" hidden>
  <div class="spinner"></div>
  <p class="loading-text">잠시만 기다려주세요</p>
</div>`,
    script: openAppScript(),
  });
}

/** 공유 카드 설명. 화면 문구와 달리 방 정보를 담아 카드에서 맥락이 보이게 한다. */
function ogDescription(view: LandingView): string {
  const invitation = view.invitation;
  if (!invitation) return "코드가 만료됐거나 유효하지 않아요.";

  return (
    invitation.roomDescription ??
    `장소 ${invitation.pinCount}개 · 멤버 ${invitation.memberCount}명`
  );
}

/**
 * 크롤러가 이미지를 받기 전에 자리를 잡는 힌트라, 실제 파일과 어긋나면 카드가
 * 잘못 그려진다. public/img/og.png를 교체하면 이 상수도 함께 확인한다.
 */
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

function previewMetaTags(view: LandingView, title: string): string {
  return [
    '<meta property="og:site_name" content="꾹">',
    '<meta property="og:locale" content="ko_KR">',
    `<meta property="og:image" content="${escapeHtml(view.ogImageUrl)}">`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`,
    `<meta property="og:image:alt" content="${escapeHtml(title)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
  ].join("\n");
}

/**
 * iOS에서 앱 전환이 감지되지 않으면 스토어로 보내기까지 기다리는 시간.
 *
 * 줄이지 말 것. 실측(iOS 18.7)에서 앱 전환에 2.9초가 걸린 적이 있고, 그보다 먼저
 * 스토어로 보내면 앱을 열고 돌아온 사용자가 App Store를 만난다.
 */
const IOS_FALLBACK_MS = 3000;

/**
 * 이동을 지시한 뒤 화면을 되돌리기까지 기다리는 시간. 이동이 성공하면 페이지와 함께
 * 사라진다. 인앱 브라우저가 intent://를 무시하는 것처럼 아무 일도 안 일어날 때,
 * 딤에 갇히지 않게 하는 유일한 장치다.
 */
const NAVIGATION_RECOVERY_MS = 3000;

/**
 * 버튼 하나로 앱 열기와 설치를 겸한다.
 *
 * Android는 intent:// 하나가 둘 다 처리한다. iOS에는 그런 폴백이 없어, 스킴을 쏜 뒤
 * 앱 전환이 감지되지 않으면 시간으로 판단해 스토어로 보낸다.
 *
 * 전환 감지에 blur를 쓰면 안 된다. iOS 18.7 실측에서, 앱이 없을 때 Safari가 띄우는
 * "주소가 유효하지 않기 때문에..." 알림창도 blur를 발생시킨다. 그걸 앱 전환으로 읽으면
 * 정작 앱이 없는 사용자의 스토어 폴백이 취소된다. 두 경우를 가르는 신호는
 * visibilitychange뿐이다.
 *
 * 클릭 없이 자동 실행하지 않는다. iOS Safari가 제스처 없는 스킴 이동을 막고,
 * 바로 스토어로 보내면 미설치자가 초대자·방 정보를 보지 못한다.
 */
function openAppScript(): string {
  return `<script>
(function () {
  var cta = document.getElementById("cta");
  if (!cta) return;
  var overlay = document.getElementById("loading");
  var ua = navigator.userAgent || "";
  var isAndroid = /Android/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/.test(ua) && "ontouchend" in document);
  var busy = false;

  function reset() {
    busy = false;
    cta.disabled = false;
    if (overlay) overlay.hidden = true;
  }

  // 돌아왔는데 딤이 남으면 아무것도 누를 수 없다. iOS는 페이지가 살아 있는 채로
  // 앱만 위에 뜨므로 pageshow만으로는 부족하다.
  window.addEventListener("pageshow", reset);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) reset();
  });

  function leave(url) {
    setTimeout(reset, ${NAVIGATION_RECOVERY_MS});
    location.href = url;
  }

  cta.addEventListener("click", function () {
    if (busy) return;
    busy = true;
    cta.disabled = true;
    if (overlay) overlay.hidden = false;

    if (isAndroid && cta.dataset.android) {
      leave(cta.dataset.android);
      return;
    }
    if (!isIOS) {
      leave(cta.dataset.store);
      return;
    }

    var timer = setTimeout(function () {
      cleanup();
      leave(cta.dataset.store);
    }, ${IOS_FALLBACK_MS});

    function cleanup() {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", cancel);
    }
    function cancel() { clearTimeout(timer); cleanup(); reset(); }
    function onHide() { if (document.hidden) cancel(); }

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", cancel);
    location.href = cta.dataset.app;
  });
})();
</script>`;
}

/** 두 오류 화면이 공유하는 일러스트. 시안 기준 203x252. */
function characterArt(): string {
  return `<img class="art narrow" src="${ASSETS.character}" alt="" width="407" height="504">`;
}

/** 코드 없이도 만들 수 있는 스토어 주소. 랜딩을 그리지 못했을 때 쓴다. */
export type StoreLinks = {
  appStoreUrl: string | undefined;
  playStoreUrl: string | undefined;
};

/**
 * 랜딩을 그리지 못했을 때의 페이지. 형식 검사 실패(400)와 예기치 못한 오류(500)만
 * 온다 — 형식은 맞는데 없는 코드는 renderLanding이 200으로 그린다.
 *
 * 앱으로 보내는 버튼이 없다. 형식이 틀린 코드로는 앱에 넘길 값을 만들 수 없다.
 */
export function renderLandingError(status: number, stores: StoreLinks): string {
  const serverFault = status >= SERVER_ERROR_STATUS;
  const title = serverFault
    ? "지금은 초대 링크를\n열 수 없어요."
    : INVALID_LINK_TITLE;
  const description = serverFault
    ? "일시적인 문제가 생겼어요.\n잠시 후 다시 시도해주세요."
    : INVALID_LINK_DESCRIPTION;

  return renderPage({
    title: title.replaceAll("\n", " "),
    head: '<meta name="robots" content="noindex">',
    body: `<main class="error">
  <h1>${multiline(title)}</h1>
  ${characterArt()}
  <p class="desc muted">${multiline(description)}</p>
</main>
${storeActions(stores)}`,
    script: storeScript(stores),
  });
}

/** 스토어 값을 아직 못 받았을 수 있다. 하나뿐이면 플랫폼과 무관하게 그쪽으로 보낸다. */
function storeActions(stores: StoreLinks): string {
  const href = stores.appStoreUrl ?? stores.playStoreUrl;
  if (!href) return "";

  return `<div class="actions">
  <a class="button secondary" id="cta" href="${escapeHtml(href)}"${
    stores.playStoreUrl
      ? ` data-android="${escapeHtml(stores.playStoreUrl)}"`
      : ""
  }>꾹으로 이동하기</a>
</div>`;
}

/** Android에서만 href를 Play로 바꾼다. 서버는 어느 기기인지 모른다. */
function storeScript(stores: StoreLinks): string | undefined {
  if (!stores.appStoreUrl || !stores.playStoreUrl) return undefined;

  return `<script>
(function () {
  var cta = document.getElementById("cta");
  if (cta && /Android/i.test(navigator.userAgent || "")) {
    cta.href = cta.dataset.android;
  }
})();
</script>`;
}
