import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { cloudTasksMaxAttempts, prefix, project, region } from "@/config";
import { enabledServices } from "@/resources/apis";
import { workerService } from "@/resources/cloud-run";
import {
  developer,
  developersGroup,
  serverServiceAccount,
} from "@/resources/identity";

/**
 * Cloud Tasks가 worker(/internal/* on Cloud Run)를 호출할 때 신원으로 쓰는 SA.
 * Cloud Run invoker 권한과 함께 이 SA가 발급한 OIDC 토큰(audience/이메일)을
 * NestJS 가드가 검증해 worker 요청을 명시적으로 제한한다.
 */
export const taskInvokerServiceAccount = new gcp.serviceaccount.Account(
  `${prefix}-tasks-invoker`,
  {
    accountId: `${prefix}-tasks-invoker`,
    displayName: `${prefix} Cloud Tasks invoker`,
  },
);

new gcp.cloudrunv2.ServiceIamMember(`${prefix}-tasks-invoker-run-invoker`, {
  name: workerService.name,
  location: workerService.location,
  project,
  role: "roles/run.invoker",
  member: pulumi.interpolate`serviceAccount:${taskInvokerServiceAccount.email}`,
});

// 앱 런타임 SA(serverServiceAccount)가 태스크에 invoker SA 신원을 붙이려면(oidcToken.
// serviceAccountEmail = invokerEmail) 그 SA에 대한 actAs 권한이 필요하다.
new gcp.serviceaccount.IAMMember(`${prefix}-tasks-invoker-actas`, {
  serviceAccountId: taskInvokerServiceAccount.name,
  role: "roles/iam.serviceAccountUser",
  member: pulumi.interpolate`serviceAccount:${serverServiceAccount.email}`,
});

// 로컬 개발 시 Cloud Tasks 없이도 tasks-invoker 명의 OIDC 토큰을 직접 발급해
// /internal/* 가드를 curl 등으로 테스트할 수 있도록.
new gcp.serviceaccount.IAMMember(
  `${prefix}-developer-impersonate-tasks-invoker`,
  {
    serviceAccountId: taskInvokerServiceAccount.name,
    role: "roles/iam.serviceAccountTokenCreator",
    member: pulumi.interpolate`serviceAccount:${developer.email}`,
  },
);

export const placeExtractionQueue = new gcp.cloudtasks.Queue(
  `${prefix}-place-extraction`,
  {
    name: `${prefix}-place-extraction`,
    location: region,
    // Gemini(Vertex AI) 호출 속도 제한. 실제 쿼터 확인 후 조정 필요.
    rateLimits: {
      maxDispatchesPerSecond: 2,
      maxConcurrentDispatches: 5,
    },
    retryConfig: {
      maxAttempts: cloudTasksMaxAttempts,
      minBackoff: "10s",
      maxBackoff: "300s",
      maxDoublings: 4,
      maxRetryDuration: "3600s",
    },
  },
  { dependsOn: enabledServices },
);

// 앱 런타임 SA가 이 큐에 태스크를 적재(enqueue)할 수 있도록.
new gcp.cloudtasks.QueueIamMember(`${prefix}-place-extraction-enqueuer`, {
  name: placeExtractionQueue.name,
  location: region,
  project,
  role: "roles/cloudtasks.enqueuer",
  member: pulumi.interpolate`serviceAccount:${serverServiceAccount.email}`,
});

// 로컬 개발 시 개인 ADC로 큐에 태스크를 직접 적재해 테스트할 수 있도록.
new gcp.cloudtasks.QueueIamMember(
  `${prefix}-place-extraction-developer-enqueuer`,
  {
    name: placeExtractionQueue.name,
    location: region,
    project,
    role: "roles/cloudtasks.enqueuer",
    member: developersGroup,
  },
);
