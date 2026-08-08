/**
 * 주입된 dotenv 원문(APP_ENV_DOTENV)을 파싱해 process.env에 채웁니다.
 * prod는 Cloud Run `--set-secrets`, 로컬은 `scripts/with-env.ts`가 주입합니다.
 *
 * 시크릿 포맷은 한 줄 = 한 키(여러 줄 값은 base64로 인코딩).
 * ConfigModule 검증 이전에 도는 부팅 최초 단계라 process.env를 직접 다룹니다.
 */

export const ENV_DOTENV_VAR = "APP_ENV_DOTENV";

export function parseDotenv(src: string): Record<string, string> {
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

export function loadSecretEnv(): void {
  const payload = process.env[ENV_DOTENV_VAR];
  if (!payload) return;

  for (const [key, value] of Object.entries(parseDotenv(payload))) {
    // 배포·셸이 넣은 값이 주입값보다 우선.
    if (process.env[key] === undefined) process.env[key] = value;
  }

  // 원문이 env에 통째로 남지 않도록 정리.
  delete process.env[ENV_DOTENV_VAR];
}
