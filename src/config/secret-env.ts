/**
 * 부팅 시 GCP Secret Manager에서 env 묶음을 가져와 process.env에 주입합니다.
 *
 * 이 프로젝트는 .env 파일을 쓰지 않고, env의 단일 출처를 Secret Manager로 둡니다.
 * 로컬이든 Cloud Run(prod)이든 "부팅하면 SM에서 받아온다"는 동작이 동일하고,
 * 유일한 차이는 "GCP 인증 토큰을 어디서 얻느냐"뿐입니다.
 *   - Cloud Run/GCE 위: 메타데이터 서버가 attached 서비스 계정 토큰을 자동으로 발급.
 *   - 로컬: 개발자의 ADC(`gcloud auth application-default login`) 토큰을 사용.
 *
 * 무거운 SDK(@google-cloud/secret-manager → gRPC/google-gax)는 bun --compile 단일
 * 바이너리 번들에 리스크가 있어, Secret Manager REST API를 fetch로 직접 호출합니다.
 *
 * ── 환경 선택 ────────────────────────────────────────────────
 * 환경은 APP_ENV(`local` | `prod`)로 명시합니다(DB 스키마 등 다른 축에서 추론하지 않음).
 *   - 로컬:      실행 스크립트(start:local)가 APP_ENV=local 을 줌  → team-mino-env-local
 *   - Cloud Run: Pulumi가 APP_ENV=prod 를 env로 주입             → team-mino-env-prod
 * 시크릿 이름은 `team-mino-env-${APP_ENV}` 규칙이며, GCP_ENV_SECRET로 직접 덮어쓸 수 있음.
 *
 * ── 탈출구 ──────────────────────────────────────────────────
 * APP_CONFIG_SOURCE=env 이면 SM을 건너뛰고 기존 process.env/.env 를 그대로 씁니다.
 * (오프라인 개발이나, SM이 아직 없는 전환기 테스트용. 평상시 로컬은 SM에서 받아옴.)
 */

const SECRET_MANAGER_BASE = "https://secretmanager.googleapis.com/v1";
const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

/**
 * GCP 액세스 토큰을 얻습니다.
 * 먼저 메타데이터 서버(클라우드 위에서만 응답)를 짧게 시도하고,
 * 실패하면(=로컬) gcloud ADC 토큰으로 폴백합니다.
 */
async function getAccessToken(): Promise<string> {
  try {
    // GCP 밖에서는 이 주소가 즉시 실패하므로 타임아웃을 짧게 둡니다.
    const res = await fetch(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      const body = (await res.json()) as { access_token: string };
      return body.access_token;
    }
  } catch {
    // 메타데이터 서버 없음 → 로컬로 간주하고 아래 ADC 경로로 폴백
  }

  const proc = Bun.spawnSync([
    "gcloud",
    "auth",
    "application-default",
    "print-access-token",
  ]);
  if (proc.exitCode !== 0) {
    throw new Error(
      "GCP 액세스 토큰 획득 실패 — `gcloud auth application-default login`을 먼저 실행하세요.",
    );
  }
  return proc.stdout.toString().trim();
}

/**
 * 시크릿 페이로드(.env 그대로의 dotenv 텍스트)를 KEY=VALUE 객체로 파싱합니다.
 * - 빈 줄과 `#` 주석 줄은 무시
 * - 값 양쪽을 감싼 따옴표(" 또는 ')는 제거
 */
function parseDotenv(src: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of src.split("\n")) {
    if (/^\s*(#|$)/.test(line)) continue;
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

/** 어느 시크릿을 읽을지 결정. GCP_ENV_SECRET 우선, 없으면 APP_ENV(기본 local)로 규칙 생성. */
function resolveSecretName(): string {
  if (process.env.GCP_ENV_SECRET) return process.env.GCP_ENV_SECRET;
  const appEnv = process.env.APP_ENV ?? "local";
  return `team-mino-env-${appEnv}`;
}

/**
 * Secret Manager에서 env를 가져와 process.env에 주입합니다.
 * 이미 설정된 값은 덮어쓰지 않습니다 — OS env로 개별 값을 수동 오버라이드할 수 있게 하기 위함.
 */
export async function loadSecretEnv(): Promise<void> {
  // 명시적으로 SM을 끈 경우: 아무것도 안 하고 기존 process.env/.env 를 사용
  if (process.env.APP_CONFIG_SOURCE === "env") return;

  const project = process.env.GCP_PROJECT ?? "team-mino-prod";
  const secret = resolveSecretName();

  const token = await getAccessToken();
  // `:access`는 시크릿의 latest 버전 값을 base64로 돌려주는 REST 엔드포인트입니다.
  const url = `${SECRET_MANAGER_BASE}/projects/${project}/secrets/${secret}/versions/latest:access`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `Secret Manager fetch 실패 (${res.status}) — projects/${project}/secrets/${secret}: ${await res.text()}`,
    );
  }

  const body = (await res.json()) as { payload: { data: string } };
  const decoded = Buffer.from(body.payload.data, "base64").toString("utf8");
  for (const [key, value] of Object.entries(parseDotenv(decoded))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
