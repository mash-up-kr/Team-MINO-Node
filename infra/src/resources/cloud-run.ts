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
    // 이미지와 env는 런타임/배포가 관리합니다(Pulumi는 서비스 구조·SA·스케일링·IAM만).
    // prod 배포 시 APP_ENV=prod 를 주입하면 앱이 team-mino-env-prod 시크릿에서 env를 받아옵니다.
    // (Pulumi가 env를 관리하면, 구 이미지 위에 깨진 리비전을 만들어 up이 실패하므로 분리.)
    ignoreChanges: [
      "template.containers[0].image",
      "template.containers[0].envs",
    ],
  },
);

new gcp.cloudrunv2.ServiceIamMember(`${prefix}-api-public-invoker`, {
  name: service.name,
  location: service.location,
  project,
  role: "roles/run.invoker",
  member: "allUsers",
});
