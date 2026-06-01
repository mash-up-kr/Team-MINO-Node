import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const stack = pulumi.getStack();

// Add a stack name here once its GCP project and infra SA are bootstrapped.
const CONFIGURED_STACKS = ["prod"];
if (!CONFIGURED_STACKS.includes(stack)) {
  throw new Error(`Stack "${stack}" is not yet configured`);
}

const projectConfig = gcp.config.project;
const regionConfig = gcp.config.region;
if (!projectConfig || !regionConfig) {
  throw new Error("gcp:project and gcp:region must both be configured");
}

export const prefix = `team-mino-${stack}`;
export const project = projectConfig;
export const region = regionConfig;
