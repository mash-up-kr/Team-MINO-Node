import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { prefix, region } from "@/config";
import { enabledServices } from "@/resources/apis";
import { service } from "@/resources/cloud-run";

// /health가 SELECT 1로 Supabase를 실제 호출하므로, 주기적으로 찔러
// Supabase가 미사용으로 IDLE(pause) 전환되는 것을 방지한다.
export const healthPingJob = new gcp.cloudscheduler.Job(
  `${prefix}-health-ping`,
  {
    name: `${prefix}-health-ping`,
    region,
    schedule: "0 * * * *",
    timeZone: "Asia/Seoul",
    attemptDeadline: "30s",
    httpTarget: {
      uri: pulumi.interpolate`${service.uri}/health`,
      httpMethod: "GET",
    },
    retryConfig: { retryCount: 3 },
  },
  { dependsOn: enabledServices },
);
