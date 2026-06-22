import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { project } from "@/config";
import { enabledServices } from "@/resources/apis";
import { serverServiceAccount } from "@/resources/identity";

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
