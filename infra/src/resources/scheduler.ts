import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { prefix, region } from "@/config";
import { enabledServices } from "@/resources/apis";
import { service } from "@/resources/cloud-run";

/*
 * DB 제공자가 유휴 프로젝트를 pause하는 것을 막는다. 활동 집계는 제공자 API 게이트웨이를
 * 지나는 요청 기준이라, 앱이 쓰는 Direct connection은 아무리 쿼리를 날려도 잡히지 않는다.
 * 그래서 서버가 제공자 API를 대신 호출하도록 /health/keep-alive를 찌른다.
 */
export const dbKeepAliveJob = new gcp.cloudscheduler.Job(
  `${prefix}-db-keep-alive`,
  {
    name: `${prefix}-db-keep-alive`,
    region,
    schedule: "0 * * * *",
    timeZone: "Asia/Seoul",
    attemptDeadline: "30s",
    httpTarget: {
      uri: pulumi.interpolate`${service.uri}/health/keep-alive`,
      httpMethod: "GET",
    },
    retryConfig: { retryCount: 3 },
  },
  { dependsOn: enabledServices },
);
