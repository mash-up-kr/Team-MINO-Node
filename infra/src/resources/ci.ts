import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { enabledServices } from "@/resources/apis";
import { prefix, project } from "@/config";

// GitHub Actions authenticates via OIDC
const githubRepository = "mash-up-kr/Team-MINO-Node";

export const infraServiceAccount = `${prefix}-infra@${project}.iam.gserviceaccount.com`;

const githubPool = new gcp.iam.WorkloadIdentityPool(
  `${prefix}-github`,
  {
    workloadIdentityPoolId: `${prefix}-github`,
    displayName: `${prefix} GitHub`,
  },
  { dependsOn: enabledServices },
);

new gcp.iam.WorkloadIdentityPoolProvider(`${prefix}-github`, {
  workloadIdentityPoolId: githubPool.workloadIdentityPoolId,
  workloadIdentityPoolProviderId: `${prefix}-github`,
  displayName: "GitHub Actions",
  attributeMapping: {
    "google.subject": "assertion.sub",
    "attribute.repository": "assertion.repository",
    "attribute.repository_owner": "assertion.repository_owner",
  },
  attributeCondition: `assertion.repository == "${githubRepository}"`,
  oidc: { issuerUri: "https://token.actions.githubusercontent.com" },
});

new gcp.serviceaccount.IAMMember(`${prefix}-ci-workload-identity-user`, {
  serviceAccountId: `projects/${project}/serviceAccounts/${infraServiceAccount}`,
  role: "roles/iam.workloadIdentityUser",
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${githubPool.name}/attribute.repository/${githubRepository}`,
});

export const workloadIdentityProvider = pulumi.interpolate`${githubPool.name}/providers/${prefix}-github`;
