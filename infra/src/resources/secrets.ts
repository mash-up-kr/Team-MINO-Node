import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { project } from "@/config";
import { enabledServices } from "@/resources/apis";
import { infraServiceAccount } from "@/resources/ci";
import { developer, serverServiceAccount } from "@/resources/identity";

/**
 * 앱 env를 담는 시크릿(local·prod). Pulumi는 "컨테이너"만 선언하고, 실제 값(버전)은
 * 평문이 git/state에 남지 않도록 gcloud/콘솔로 직접 주입합니다.
 *   echo 'DATABASE_URL=...' | gcloud secrets versions add team-mino-env-prod --data-file=- --project <project>
 *
 * 읽기 권한: 개발자 그룹은 프로젝트 레벨(→ identity.ts), Cloud Run runtime SA는 prod만(아래).
 */

export const localEnvSecret = new gcp.secretmanager.Secret(
  "team-mino-env-local",
  {
    secretId: "team-mino-env-local",
    replication: { auto: {} },
  },
  { dependsOn: enabledServices },
);

export const prodEnvSecret = new gcp.secretmanager.Secret(
  "team-mino-env-prod",
  {
    secretId: "team-mino-env-prod",
    replication: { auto: {} },
  },
  { dependsOn: enabledServices },
);

// Cloud Run runtime SA가 부팅 시 prod env를 읽을 수 있도록.
new gcp.secretmanager.SecretIamMember("team-mino-env-prod-runtime", {
  secretId: prodEnvSecret.secretId,
  project,
  role: "roles/secretmanager.secretAccessor",
  member: pulumi.interpolate`serviceAccount:${serverServiceAccount.email}`,
});

// CI가 배포 전 Drizzle 마이그레이션에 필요한 prod env를 읽을 수 있도록.
const ciMember = `serviceAccount:${infraServiceAccount}`;

new gcp.secretmanager.SecretIamMember("team-mino-env-prod-ci-read", {
  secretId: prodEnvSecret.secretId,
  project,
  role: "roles/secretmanager.secretAccessor",
  member: ciMember,
});

// 개발자 SA가 로컬 실행 시 두 env를 읽고(secretAccessor)·갱신(secretVersionManager)할 수 있도록.
const developerMember = pulumi.interpolate`serviceAccount:${developer.email}`;

new gcp.secretmanager.SecretIamMember("team-mino-env-local-developer-read", {
  secretId: localEnvSecret.secretId,
  project,
  role: "roles/secretmanager.secretAccessor",
  member: developerMember,
});
new gcp.secretmanager.SecretIamMember("team-mino-env-local-developer-write", {
  secretId: localEnvSecret.secretId,
  project,
  role: "roles/secretmanager.secretVersionManager",
  member: developerMember,
});
new gcp.secretmanager.SecretIamMember("team-mino-env-prod-developer-read", {
  secretId: prodEnvSecret.secretId,
  project,
  role: "roles/secretmanager.secretAccessor",
  member: developerMember,
});
new gcp.secretmanager.SecretIamMember("team-mino-env-prod-developer-write", {
  secretId: prodEnvSecret.secretId,
  project,
  role: "roles/secretmanager.secretVersionManager",
  member: developerMember,
});
