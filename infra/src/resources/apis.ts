import * as gcp from "@pulumi/gcp";

const REQUIRED_APIS = [
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com",
  "cloudscheduler.googleapis.com",
  "aiplatform.googleapis.com",
  "cloudtasks.googleapis.com",
  "storage.googleapis.com",
  "firebase.googleapis.com",
  "firebasehosting.googleapis.com",
  // Firebase Authentication(익명 인증) ID 토큰 검증에 쓴다.
  "identitytoolkit.googleapis.com",
  "fcm.googleapis.com",
  "firebaseinstallations.googleapis.com",
];

export const enabledServices = REQUIRED_APIS.map(
  (api) =>
    new gcp.projects.Service(api, { service: api, disableOnDestroy: false }),
);
