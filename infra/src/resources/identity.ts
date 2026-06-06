import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { prefix, project } from "@/config";
import { infraServiceAccount } from "@/resources/ci";

export const serverServiceAccount = new gcp.serviceaccount.Account(
  `${prefix}-server`,
  {
    accountId: `${prefix}-server`,
    displayName: `${prefix} Cloud Run runtime`,
  },
);

new gcp.projects.IAMMember(`${prefix}-server-log-writer`, {
  project,
  role: "roles/logging.logWriter",
  member: pulumi.interpolate`serviceAccount:${serverServiceAccount.email}`,
});

export const developer = new gcp.serviceaccount.Account(`${prefix}-developer`, {
  accountId: `${prefix}-developer`,
  displayName: `${prefix} developer`,
});

const developerRoles: Record<string, string> = {
  "run-developer": "roles/run.developer",
  "artifactregistry-writer": "roles/artifactregistry.writer",
  "logging-viewer": "roles/logging.viewer",
};
for (const [key, role] of Object.entries(developerRoles)) {
  new gcp.projects.IAMMember(`developer-${key}`, {
    project,
    role,
    member: pulumi.interpolate`serviceAccount:${developer.email}`,
  });
}

new gcp.serviceaccount.IAMMember(`${prefix}-developer-act-as-runtime`, {
  serviceAccountId: serverServiceAccount.name,
  role: "roles/iam.serviceAccountUser",
  member: pulumi.interpolate`serviceAccount:${developer.email}`,
});

// Developer membership is managed manually
const developersGroup = "group:mash-up-16th-team-mino-node@googlegroups.com";

const developerGroupRoles: Record<string, string> = {
  ...developerRoles,
  viewer: "roles/viewer",
};
for (const [key, role] of Object.entries(developerGroupRoles)) {
  new gcp.projects.IAMMember(`developers-group-${key}`, {
    project,
    role,
    member: developersGroup,
  });
}

// Developers impersonate both the developer SA and the (owner) infra SA.
new gcp.serviceaccount.IAMMember("developers-group-impersonate-developer", {
  serviceAccountId: developer.name,
  role: "roles/iam.serviceAccountTokenCreator",
  member: developersGroup,
});
new gcp.serviceaccount.IAMMember("developers-group-impersonate-infra", {
  serviceAccountId: `projects/${project}/serviceAccounts/${infraServiceAccount}`,
  role: "roles/iam.serviceAccountTokenCreator",
  member: developersGroup,
});
