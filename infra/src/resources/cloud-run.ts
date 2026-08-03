import * as gcp from "@pulumi/gcp";
import { prefix, project, region } from "@/config";
import { enabledServices } from "@/resources/apis";
import { serverServiceAccount } from "@/resources/identity";

// Cloud Tasks dispatchDeadline(9분, tasks.service.ts)보다 짧게 유지한다.
// timeout이 deadline보다 길면 deadline 초과 시점에 Cloud Tasks가 재배달하는데
// 원본 요청은 아직 실행 중이라 같은 작업이 중복 실행된다. 마진을 둬서
// 느린 task는 Cloud Run이 504로 확정 응답한 뒤에 판정이 나게 한다.
const CLOUD_RUN_REQUEST_TIMEOUT_SECONDS = 8.5 * 60;

export const service = new gcp.cloudrunv2.Service(
  `${prefix}-api`,
  {
    name: `${prefix}-api`,
    location: region,
    deletionProtection: false,
    ingress: "INGRESS_TRAFFIC_ALL",
    template: {
      serviceAccount: serverServiceAccount.email,
      timeout: `${CLOUD_RUN_REQUEST_TIMEOUT_SECONDS}s`,
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
    // 이미지·env는 배포(deploy.yml)가 관리. Pulumi가 건드리면 구 이미지 위에 리비전을
    // 새로 만들어 up이 실패하므로 분리. 배포가 APP_ENV=prod를 주입 → prod 시크릿 fetch.
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
