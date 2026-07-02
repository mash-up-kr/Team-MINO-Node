# Sentry 오류 알림 운영

이 서비스는 `@sentry/bun`으로 예상하지 못한 서버 오류와 HTTP 5xx만 수집한다. 정상적인 4xx, 요청·사용자 정보, 오류 원문은 전송하지 않는다. 운영 DSN은 GCP Secret Manager의 `team-mino-env-prod`에 보관하고, 배포 workflow는 Git SHA 기반 `SENTRY_RELEASE`를 Cloud Run에 주입한다.

## 최초 설정

1. Sentry 조직에서 Bun 플랫폼의 `team-mino-api` 프로젝트를 만든다.
2. 기존 `team-mino-env-prod` dotenv 묶음에 `SENTRY_DSN=<project DSN>`을 추가한 새 Secret Manager version을 등록한다. 기존 키를 빠뜨리지 말고 DSN을 저장소, 이슈, PR 본문에 붙이지 않는다.
3. Sentry의 **Organization Settings > Integrations > Discord**에서 공식 Discord 앱을 팀 서버에 설치한다. 앱에는 `node-sentry` 채널의 View Channel, Send Messages, Embed Links 권한만 부여한다.
4. 프로젝트의 **Alerts**에서 이슈 기반 workflow를 만들고 Discord action의 채널을 `node-sentry`로 지정한다.

## 알림 정책

- 조건 결합은 ANY이다.
- 새 이슈가 생성될 때 알린다.
- 해결된 이슈가 다시 unresolved 상태가 될 때 알린다.
- 동일한 unresolved 이슈의 반복 이벤트에는 알리지 않는다.
- action frequency는 Sentry가 허용하는 최솟값인 5분으로 둔다.

Sentry UI가 Monitors & Alerts workflow를 사용하는 경우 Issue detector에 위 두 상태 전이를 연결하고, workflow action을 공식 Discord integration의 `node-sentry` 채널로 설정한다. 저장 후 workflow 상세 화면을 다시 열어 detector, 두 trigger, Discord action, 5분 frequency를 확인한다.

## 검증

로컬 자격 증명은 셸 환경에만 둔다. Sentry 프로젝트의 **Project Settings > Client Keys (DSN) > Send Test Event**로 고유 이벤트 한 건을 전송하거나, 아래처럼 REPL에서 즉석 스크립트로 검증한다.

```bash
SENTRY_DSN="..." bun repl <<'EOF'
const Sentry = await import("@sentry/bun");
const { createSentryOptions } = await import("./src/config/sentry.config");
Sentry.init(createSentryOptions({ NODE_ENV: "production", SENTRY_DSN: process.env.SENTRY_DSN }));
Sentry.captureException(new Error("team-mino-sentry-qa"));
await Sentry.flush(2000);
EOF
```

Sentry에서 이슈를 찾고 최초 Discord 메시지의 이슈 URL과 대조한다. 이슈를 resolved로 바꾸고 6분 후 같은 방식으로 다시 전송해 regression 메시지 한 건을 확인한다. unresolved 상태에서 한 번 더 전송했을 때 이벤트 수는 증가하지만 새 Discord 메시지는 없어야 한다.

## 롤백

알림만 중지하려면 Sentry workflow를 비활성화한다. 수집도 중지하려면 `team-mino-env-prod`에서 `SENTRY_DSN`을 제외한 새 Secret Manager version을 등록하고 Cloud Run revision을 재시작한다. Discord 앱 제거는 다른 Sentry 프로젝트가 같은 서버 연동을 사용하지 않는지 확인한 뒤 수행한다.
