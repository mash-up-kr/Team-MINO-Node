import type { LandingView } from "./app-link.type";

/**
 * 정적 파일 경로. Cloud Run이 public/을 그대로 서빙한다(config/static-assets.ts).
 * 오류 화면과 없는 코드 화면이 같은 일러스트를 쓰므로 한 곳에서 정한다.
 */
const ASSETS = {
  avatar: "/img/avatar.png",
  invitation: "/img/invitation.png",
  character: "/img/character.png",
} as const;

/**
 * 시안의 오류 화면 문구.
 *
 * 형식이 틀린 코드(400)와 형식은 맞지만 없는 코드(200)는 도달 경로가 다르지만
 * 보는 사람에게는 "링크가 안 된다"는 같은 상황이라 같은 화면을 쓴다.
 */
const INVALID_LINK_TITLE = "이 초대 링크는\n사용할 수 없어요.";
const INVALID_LINK_DESCRIPTION =
  "코드가 만료됐거나 유효하지 않아요.\n친구에게 새 링크를 요청해보세요.";

/** 5xx만 우리 쪽 장애다. 4xx는 링크가 잘못된 경우라 문구가 다르다. */
const SERVER_ERROR_STATUS = 500;

/**
 * 디자인 시안(Figma 랜딩페이지_초대장 / _오류)에서 옮긴 값.
 *
 * 시안 프레임은 375x812이고 버튼이 335x48(radius 12)이라 좌우 여백이 20px이다.
 * 폰트는 SUITE(SIL OFL)로, public/fonts를 같은 오리진에서 서빙한다(config/static-assets.ts).
 * swap을 두어 폰트가 늦게 와도 본문이 먼저 보이게 한다.
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
   * 시안 프레임(375x812)을 그대로 한 덩어리로 두고 화면 가운데에 놓는다.
   *
   * 폰 화면에서는 프레임이 뷰포트와 같아 지금까지와 똑같이 보이고, 데스크톱처럼
   * 큰 화면에서만 아래 버튼이 창 맨 밑까지 밀려나지 않는다.
   *
   * 높이는 min()이라 짧은 화면에서는 뷰포트를 따라간다. min-height라서 내용이
   * 그보다 길면 프레임이 늘어나고 페이지가 스크롤된다 — 잘리지 않는다.
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
  /*
   * 위 여백과 요소 사이 간격은 시안에서 잰 값이고 두 화면이 다르다. 초대장은
   * 제목 위에 아바타가 하나 더 있어 시작이 2px 낮고, 오류 화면은 문구가 짧아
   * 일러스트 위아래가 더 넓다. 같은 골격을 쓰되 이 두 값만 갈아 끼운다.
   */
  main { --content-top: 128px; --content-gap: 46px;
    width: 100%; max-width: 335px; flex: 1; padding-top: var(--content-top);
    display: flex; flex-direction: column; align-items: center; }
  main.error { --content-top: 126px; --content-gap: 71px; }

  .avatar { width: 40px; height: 40px; border-radius: 50%; margin-bottom: 12px;
    border: 1px solid rgba(112, 115, 124, 0.08); }
  h1 { margin: 0; font-weight: 700; font-size: 24px; line-height: 32px; letter-spacing: -0.55px; }
  /*
   * 시안이 잡아 둔 건 일러스트의 높이다(초대장 243, 오류 252). 내보낸 PNG는
   * 선 굵기만큼 가로가 더 넓어서, 너비를 맞추면 세로가 줄고 아래 문구가 따라
   * 올라간다. 높이를 고정하고 너비를 비율에 맡긴다.
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
`;

/** 방 이름·닉네임은 사용자 입력이라 그대로 넣으면 스크립트가 실행된다. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 시안의 줄바꿈을 그대로 살린다. 텍스트는 이스케이프하고 <br>만 남긴다. */
function multiline(value: string): string {
  return value.split("\n").map(escapeHtml).join("<br>");
}

/**
 * 두 페이지가 공유하는 골격.
 *
 * 랜딩과 오류 페이지는 진입 경로가 달라 함수를 나누지만(하나는 핸들러가, 다른 하나는
 * 예외 필터가 부른다), 보이는 뼈대는 같다. 스타일·메타를 한 곳에서만 고치도록 뽑는다.
 *
 * `head`와 `body`는 이미 만들어진 HTML이라 이스케이프하지 않는다. 호출부가 사용자
 * 입력을 넣을 때 escapeHtml을 거치는 책임을 진다.
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
 * 이 페이지에 도달했다는 건 "앱이 안 열렸다"는 뜻이지 "앱이 없다"는 뜻이 아니다.
 * 카카오톡·인스타그램 인앱 브라우저는 유니버설 링크/App Links를 발동시키지 않아서,
 * 앱이 설치된 사용자도 대부분 여기로 온다. 그래서 버튼 하나가 앱 열기와 설치를 겸한다.
 *
 * 코드의 유효 여부와 무관하게 noindex를 붙인다. 초대 코드는 그 자체가 방의 접근
 * 권한이라(PRD 4장), 색인되면 링크를 받지 않은 사람도 검색으로 방에 들어올 수 있다.
 * 공유 카드는 OG 태그를 읽는 것이라 이 지시어의 대상이 아니다.
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
 * 공유 카드 이미지 및 미리보기 메타.
 *
 * 카카오톡·iMessage·페이스북·슬랙은 Open Graph를 읽고, X만 twitter:card를
 * 추가로 본다. X도 이미지·제목은 og:*로 폴백하므로 이미지는 한 장이면 된다.
 * (인스타그램은 피드·스토리에 링크 미리보기가 없고 DM만 OG를 읽는다.)
 *
 * width/height는 크롤러가 이미지를 내려받기 전에 자리를 잡게 해주는 힌트라,
 * 실제 파일과 어긋나면 카드가 잘못 그려진다. 아래 값은 디자인 요청 규격과
 * 같아야 한다 — 다른 크기를 받으면 이 상수도 함께 고친다.
 */
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

function previewMetaTags(view: LandingView, title: string): string {
  const tags = [
    '<meta property="og:site_name" content="꾹">',
    '<meta property="og:locale" content="ko_KR">',
  ];

  if (!view.ogImageUrl) {
    // 이미지가 없으면 이미지 없는 텍스트 카드가 뜬다.
    tags.push('<meta name="twitter:card" content="summary">');
    return tags.join("\n");
  }

  tags.push(
    `<meta property="og:image" content="${escapeHtml(view.ogImageUrl)}">`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`,
    `<meta property="og:image:alt" content="${escapeHtml(title)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
  );

  return tags.join("\n");
}

/** iOS에서 앱 전환이 감지되지 않으면 스토어로 보내기까지 기다리는 시간. */
const IOS_FALLBACK_MS = 2200;

/**
 * 버튼 하나로 앱 열기와 설치를 겸한다.
 *
 * Android는 intent:// 하나가 둘 다 처리한다 — 앱이 있으면 열리고, 없으면
 * browser_fallback_url이 referrer를 실은 스토어로 보낸다.
 *
 * iOS에는 그런 폴백이 없다. 커스텀 스킴은 앱이 없으면 조용히 무시되고(설치 여부를
 * 웹에 알려주지 않는다), 그래서 시간으로 추정할 수밖에 없다. 스킴을 쏜 뒤 앱 전환이
 * 감지되지 않으면 스토어로 보낸다. 전환 감지는 한 이벤트만 믿지 않는다 — 인앱
 * 브라우저에서 visibilitychange가 발화하지 않는 경우가 있어 pagehide·blur도 함께 본다.
 *
 * 자동 실행은 하지 않는다. iOS Safari가 사용자 제스처 없는 커스텀 스킴 이동을 막고,
 * 자동으로 스토어에 보내면 미설치자가 초대자·방 정보를 보지 못한다.
 */
function openAppScript(): string {
  return `<script>
(function () {
  var cta = document.getElementById("cta");
  if (!cta) return;
  var ua = navigator.userAgent || "";
  var isAndroid = /Android/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/.test(ua) && "ontouchend" in document);
  var busy = false;

  function reset() { busy = false; cta.disabled = false; }
  window.addEventListener("pageshow", reset);

  cta.addEventListener("click", function () {
    if (busy) return;
    busy = true;
    cta.disabled = true;

    if (isAndroid && cta.dataset.android) {
      location.href = cta.dataset.android;
      return;
    }
    if (!isIOS) {
      location.href = cta.dataset.store;
      return;
    }

    var timer = setTimeout(function () {
      cleanup();
      location.href = cta.dataset.store;
    }, ${IOS_FALLBACK_MS});

    function cleanup() {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("blur", cancel);
    }
    function cancel() { clearTimeout(timer); cleanup(); reset(); }
    function onHide() { if (document.hidden) cancel(); }

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("blur", cancel);
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
 * 랜딩을 그리지 못했을 때의 페이지.
 *
 * 여기로 오는 경우는 둘뿐이다 — 코드가 형식 검사를 통과하지 못했거나(400),
 * 예기치 못한 오류가 났거나(500). 형식은 맞는데 없거나 만료된 코드는
 * renderLanding이 200으로 그리므로 이쪽으로 오지 않는다.
 *
 * 앱으로 보내는 버튼은 없다. 형식이 틀린 코드로는 앱에 넘길 값 자체가 만들어지지
 * 않아서, 시안의 버튼은 스토어로만 보낸다.
 *
 * `.well-known`은 OS가 읽는 파일이라 이 페이지를 쓰지 않는다(그쪽은 JSON 그대로).
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

/**
 * 스토어로 보내는 버튼.
 *
 * 아직 받지 못한 스토어 값이 있을 수 있다(둘 다 없으면 버튼을 그리지 않는다).
 * 하나만 있으면 플랫폼과 무관하게 그쪽으로 보낸다 — 잘못된 스토어라도 앱을
 * 찾을 방법이 그것뿐이고, 빈 버튼보다는 낫다.
 */
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
