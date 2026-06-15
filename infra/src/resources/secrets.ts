import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { project } from "@/config";
import { enabledServices } from "@/resources/apis";
import { serverServiceAccount } from "@/resources/identity";

/**
 * 앱 env를 담는 Secret Manager 시크릿(환경별 단일 시크릿).
 *
 * env의 단일 출처를 Secret Manager로 두고, 로컬·Cloud Run 모두 부팅 시 여기서 fetch합니다.
 * 환경은 둘뿐입니다(혼동을 피하려고 dev라는 표현은 쓰지 않음):
 *   - local: 개발자 로컬 실행이 읽음 (team-mino-env-local)
 *   - prod : Cloud Run이 읽음        (team-mino-env-prod)
 *
 * Pulumi는 시크릿 "컨테이너"만 선언합니다. 실제 값(버전)은 평문이 git/Pulumi state에
 * 남지 않도록 gcloud/콘솔로 직접 주입합니다:
 *     printf 'DATABASE_URL=...\nDATABASE_SCHEMA=production\nDB_POOL_SIZE=5\n' \
 *       | gcloud secrets versions add team-mino-env-prod --data-file=- --project <project>
 *
 * 읽기 권한(IAM):
 *   - 개발자 그룹: 프로젝트 레벨 secretAccessor (→ identity.ts). local·prod 모두 읽음.
 *   - Cloud Run runtime SA: prod 시크릿만(서비스가 자기 env를 부팅 시 읽어야 하므로). 아래.
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
