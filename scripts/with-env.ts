#!/usr/bin/env bun

/**
 * 로컬 실행 래퍼. Secret Manager의 dotenv 원문을 받아 주입하고 자식 명령을 실행합니다.
 *
 *   bun run scripts/with-env.ts -- nest start --watch --exec bun
 *
 * drizzle-kit처럼 process.env를 직접 읽는 도구를 위해 개별 키까지 함께 주입합니다.
 * SDK는 devDependency라 프로덕션 번들에는 포함되지 않습니다.
 */

import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { ENV_DOTENV_VAR, parseDotenv } from "../src/config/secret-env";

const SECRET_FETCH_TIMEOUT_MS = 10_000;

async function fetchSecret(project: string, secret: string): Promise<string> {
  // fallback: true → gRPC 네이티브 의존성 대신 REST 사용.
  const client = new SecretManagerServiceClient({ fallback: true });
  const [version] = await client.accessSecretVersion(
    { name: `projects/${project}/secrets/${secret}/versions/latest` },
    { timeout: SECRET_FETCH_TIMEOUT_MS },
  );
  return version.payload?.data?.toString() ?? "";
}

async function main(): Promise<void> {
  // `bun run x.ts -- cmd`는 bun이 `--`를 떼고 넘기지만, 직접 실행 시엔 남는다.
  const args = process.argv.slice(2);
  const command = args[0] === "--" ? args.slice(1) : args;
  if (command.length === 0) {
    console.error("usage: bun run scripts/with-env.ts -- <command> [args...]");
    process.exit(1);
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
  };
  env.APP_ENV ??= "local";

  if (env.APP_CONFIG_SOURCE !== "env") {
    const project = env.GCP_PROJECT ?? "team-mino-prod";
    const secret = env.GCP_ENV_SECRET ?? `team-mino-env-${env.APP_ENV}`;

    let payload: string;
    try {
      payload = await fetchSecret(project, secret);
    } catch (error) {
      console.error(`시크릿을 가져오지 못했습니다: ${secret} (${project})`);
      console.error(error instanceof Error ? error.message : error);
      console.error(
        "ADC 로그인(gcloud auth application-default login)을 확인하거나, APP_CONFIG_SOURCE=env 로 우회하세요.",
      );
      process.exit(1);
    }

    env[ENV_DOTENV_VAR] = payload;
    for (const [key, value] of Object.entries(parseDotenv(payload))) {
      if (env[key] === undefined) env[key] = value;
    }
  }

  const child = Bun.spawn(command, {
    env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(await child.exited);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
