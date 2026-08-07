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
];

export const enabledServices = REQUIRED_APIS.map(
  (api) =>
    new gcp.projects.Service(api, { service: api, disableOnDestroy: false }),
);
