import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { enabledServices } from "@/resources/apis";
import { prefix, project, region } from "@/config";

const repository = new gcp.artifactregistry.Repository(
  `${prefix}-docker`,
  {
    repositoryId: `${prefix}-docker`,
    location: region,
    format: "DOCKER",
    description: `${prefix} container images`,
  },
  { dependsOn: enabledServices },
);

export const repositoryUrl = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${repository.repositoryId}`;
