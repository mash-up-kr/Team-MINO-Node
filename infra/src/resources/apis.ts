import * as gcp from "@pulumi/gcp";

const REQUIRED_APIS = ["run.googleapis.com", "artifactregistry.googleapis.com"];

export const enabledServices = REQUIRED_APIS.map(
  (api) =>
    new gcp.projects.Service(api, { service: api, disableOnDestroy: false }),
);
