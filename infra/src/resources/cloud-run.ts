import * as gcp from "@pulumi/gcp";
import { prefix, project, region } from "@/config";
import { enabledServices } from "@/resources/apis";
import { serverServiceAccount } from "@/resources/identity";

export const service = new gcp.cloudrunv2.Service(
  `${prefix}-api`,
  {
    name: `${prefix}-api`,
    location: region,
    deletionProtection: false,
    ingress: "INGRESS_TRAFFIC_ALL",
    template: {
      serviceAccount: serverServiceAccount.email,
      scaling: { minInstanceCount: 1, maxInstanceCount: 1 },
      containers: [
        {
          // Placeholder image before deployment
          image: "us-docker.pkg.dev/cloudrun/container/hello",
          ports: { containerPort: 3000 },
          resources: {
            cpuIdle: true,
            limits: { cpu: "0.08", memory: "128Mi" },
          },
        },
      ],
    },
  },
  {
    dependsOn: enabledServices,
    ignoreChanges: ["template.containers[0].image"],
  },
);

new gcp.cloudrunv2.ServiceIamMember(`${prefix}-api-public-invoker`, {
  name: service.name,
  location: service.location,
  project,
  role: "roles/run.invoker",
  member: "allUsers",
});
