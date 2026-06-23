import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

/**
 * 부팅 시 GCP Secret Manager에서 env 묶음을 가져와 process.env에 주입합니다.
 *
 * env의 단일 출처를 Secret Manager로 두고, 로컬·Cloud Run 모두 부팅 시 fetch합니다.
 * 환경은 APP_ENV(`local` | `prod`)로 고르며 시크릿 `team-mino-env-${APP_ENV}`에 매핑됩니다.
 * APP_CONFIG_SOURCE=env 이면 SM을 건너뛰고 기존 process.env/.env 를 씁니다(오프라인/전환기용).
 *
 * 부팅 최초 단계(ConfigModule 검증 이전)라 ConfigService가 없으므로,
 * "env는 ConfigService로만" 규칙의 의도적 예외로 process.env를 직접 다룹니다.
 */

const SECRET_FETCH_TIMEOUT_MS = 5000;

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

function resolveSecretName(): string {
  if (process.env.GCP_ENV_SECRET) return process.env.GCP_ENV_SECRET;
  return `team-mino-env-${process.env.APP_ENV ?? "local"}`;
}

export async function loadSecretEnv(): Promise<void> {
  if (process.env.APP_CONFIG_SOURCE === "env") return;

  const project = process.env.GCP_PROJECT ?? "team-mino-prod";
  const secret = resolveSecretName();

  // fallback: true → gRPC 네이티브 의존성 대신 REST 사용(bun --compile 단일 바이너리 번들 안전).
  const client = new SecretManagerServiceClient({ fallback: true });
  const [version] = await client.accessSecretVersion(
    { name: `projects/${project}/secrets/${secret}/versions/latest` },
    { timeout: SECRET_FETCH_TIMEOUT_MS },
  );

  const payload = version.payload?.data?.toString() ?? "";
  for (const [key, value] of Object.entries(parseDotenv(payload))) {
    // 이미 설정된 값은 보존 → OS env로 개별 오버라이드 허용.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
