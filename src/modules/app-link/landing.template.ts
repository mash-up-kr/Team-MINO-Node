import type { LandingView } from "./app-link.type";

/** 랜딩과 에러 페이지가 공유하는 최소 스타일. */
const BASE_STYLE = `
  :root { color-scheme: light dark; }
  body {
    margin: 0; padding: 2rem 1.25rem;
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
    display: flex; flex-direction: column; align-items: center; gap: 1.5rem;
  }
  main { width: 100%; max-width: 24rem; text-align: center; }
  h1 { font-size: 1.25rem; line-height: 1.5; margin: 0 0 0.5rem; }
  p.meta { margin: 0; opacity: 0.7; font-size: 0.9rem; }
  .actions { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 2rem; }
  a.button {
    display: block; padding: 0.9rem 1rem; border-radius: 0.75rem;
    text-decoration: none; font-weight: 600;
  }
  a.primary { background: #111; color: #fff; }
  a.secondary { border: 1px solid currentColor; }
  .code { margin-top: 2rem; font-size: 0.85rem; opacity: 0.7; line-height: 1.6; }
  .code strong { font-size: 1.1rem; letter-spacing: 0.1em; }
  @media (prefers-color-scheme: dark) { a.primary { background: #fff; color: #111; } }
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
  description: string;
  head?: string;
  body?: string;
}): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
${page.head ?? ""}
<style>${BASE_STYLE}</style>
</head>
<body>
<main>
  <h1>${escapeHtml(page.title)}</h1>
  <p class="meta">${escapeHtml(page.description)}</p>
${page.body ?? ""}
</main>
</body>
</html>`;
}

/**
 * 초대 랜딩 페이지.
 *
 * 이 페이지에 도달했다는 건 "앱이 안 열렸다"는 뜻이지 "앱이 없다"는 뜻이 아니다.
 * 카카오톡·인스타그램 인앱 브라우저는 유니버설 링크/App Links를 발동시키지 않아서,
 * 앱이 설치된 사용자도 대부분 여기로 온다. 그래서 설치와 앱 열기를 함께 둔다.
 *
 * 스토어로 자동 리다이렉트하지 않는다. PRD의 "OO님이 초대했어요"(방 이름·장소 수·
 * 멤버 수) 미리보기를 건너뛰게 되고, iOS 재진입 안내를 놓을 자리가 사라진다.
 *
 * 플랫폼 판별은 서버가 아니라 브라우저에서 한다. 서버가 UA로 갈라 렌더링하면
 * 캐시가 한 플랫폼용 HTML을 다른 플랫폼에 내주기 때문이다(Vary 관리가 필요해진다).
 * 두 플랫폼 링크를 모두 심어 두고 아래 스크립트가 맞는 쪽만 남긴다.
 */
export function renderLanding(view: LandingView, inviteUrl: string): string {
  const invitation = view.invitation;
  const title = invitation
    ? `${invitation.inviterNickname}님이 "${invitation.roomName}"에 초대했어요`
    : "초대 링크를 확인할 수 없어요";
  const description = invitation
    ? (invitation.roomDescription ??
      `장소 ${invitation.pinCount}개 · 멤버 ${invitation.memberCount}명`)
    : "링크가 만료되었거나 주소가 잘못되었을 수 있어요.";

  return renderPage({
    title,
    description: subtitle(view),
    head: `<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(inviteUrl)}">
${previewMetaTags(view, title)}
${invitation ? "" : '<meta name="robots" content="noindex">'}`,
    body: `
  <div class="actions">
    <a class="button primary" id="install" href="${escapeHtml(view.appStoreUrl ?? view.playStoreUrl ?? inviteUrl)}">설치하고 참여하기</a>
    <a class="button secondary" id="open-app" href="${escapeHtml(view.iosAppUrl)}">앱에서 열기</a>
  </div>

  <p class="code">
    <span id="reopen-hint" hidden>앱을 설치한 뒤 <strong>이 링크를 다시 눌러</strong> 주세요.<br></span>
    초대 코드 <strong>${escapeHtml(view.code)}</strong>
  </p>
${platformScript(view)}`,
  });
}

/**
 * 코드가 무효해도 버튼은 그대로 두고 안내만 바꾼다. 앱이 설치돼 있으면
 * 앱 쪽 에러 화면이 훨씬 낫고, 미설치자에게는 달리 보낼 곳이 없다.
 */
function subtitle(view: LandingView): string {
  const invitation = view.invitation;
  if (!invitation) {
    return "앱이 설치되어 있다면 앱에서 열어 확인해 주세요.";
  }

  return `장소 ${invitation.pinCount}개 · 멤버 ${invitation.memberCount}명`;
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

/**
 * 플랫폼별로 링크와 안내를 맞춘다.
 *
 * Android는 intent:// 하나로 두 경우가 다 풀린다 — 앱이 있으면 열리고,
 * 없으면 browser_fallback_url이 referrer를 실은 스토어로 보낸다. 그래서
 * "앱에서 열기"와 "설치" 버튼을 나눌 필요가 없어 하나로 합친다.
 *
 * iOS는 그런 폴백이 없다. 커스텀 스킴은 앱이 없으면 오류 알림이 뜨므로
 * 설치를 주 버튼으로 두고 앱 열기를 보조로 남긴다.
 *
 * 자동 실행은 하지 않는다. Android에서 자동으로 intent://를 쏘면 미설치
 * 사용자가 곧장 스토어로 튕겨 미리보기를 못 본다. 위 주석의 판단과 같은 이유다.
 */
function platformScript(view: LandingView): string {
  const android = view.androidAppUrl ?? "";
  const play = view.playStoreUrl ?? "";

  return `<script>
(function () {
  var ua = navigator.userAgent || "";
  var isAndroid = /Android/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/.test(ua) && "ontouchend" in document);
  var install = document.getElementById("install");
  var openApp = document.getElementById("open-app");
  var hint = document.getElementById("reopen-hint");

  if (isAndroid) {
    // intent:// 하나가 앱 실행과 스토어 폴백을 모두 처리한다.
    install.href = ${JSON.stringify(android || play)};
    install.textContent = "앱으로 열기 · 설치하기";
    openApp.hidden = true;
  } else if (isIOS) {
    // 설치 후 코드를 되찾는 유일한 경로가 링크 재진입이라 안내를 노출한다.
    hint.hidden = false;
  } else {
    // 데스크톱 등: 앱을 열 수단이 없으므로 보조 버튼을 감춘다.
    openApp.hidden = true;
  }
})();
</script>`;
}

/**
 * 랜딩을 그리지 못했을 때의 페이지.
 *
 * 여기로 오는 경우는 둘뿐이다 — 코드가 형식 검사를 통과하지 못했거나(400),
 * 예기치 못한 오류가 났거나(500). 형식은 맞는데 없거나 만료된 코드는
 * renderLanding이 200으로 그리므로 이쪽으로 오지 않는다.
 *
 * 그래서 앱으로 보내는 버튼이 없다. 형식이 틀린 코드로는 앱에 넘길 값 자체가
 * 만들어지지 않기 때문이다.
 *
 * `.well-known`은 OS가 읽는 파일이라 이 페이지를 쓰지 않는다(그쪽은 JSON 그대로).
 */
export function renderLandingError(status: number): string {
  const message =
    status === 400
      ? "초대 링크 형식이 올바르지 않아요."
      : "초대 링크를 열 수 없어요.";

  return renderPage({
    title: message,
    description:
      "링크가 만료되었거나 주소가 잘못되었을 수 있어요. 초대한 분에게 링크를 다시 받아주세요.",
    head: '<meta name="robots" content="noindex">',
  });
}
