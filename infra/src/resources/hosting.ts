import * as gcp from "@pulumi/gcp";
import { project, region } from "@/config";
import { enabledServices } from "@/resources/apis";
import { service } from "@/resources/cloud-run";

// 서울 리전은 Cloud Run 도메인 매핑 미지원이라, 도메인·TLS를 Hosting이 대신 맡는다.

const firebaseProject = new gcp.firebase.Project(
  "team-mino",
  { project },
  { dependsOn: enabledServices },
);

const site = new gcp.firebase.HostingSite(
  project,
  { project, siteId: project },
  { dependsOn: [firebaseProject] },
);

const version = new gcp.firebase.HostingVersion(
  "api",
  {
    siteId: project,
    config: {
      headers: [
        {
          regex: "^/api-docs.*$",
          headers: { "Cache-Control": "no-cache, no-store" },
        },
      ],
      rewrites: [{ glob: "**", run: { serviceId: service.name, region } }],
    },
  },
  { dependsOn: [site] },
);

new gcp.firebase.HostingRelease("api", {
  siteId: project,
  versionName: version.name,
  message: "api.gguk.org -> cloud run",
});

// DNS는 Cloudflare에 수동 등록(IaC 밖).
export const customDomain = new gcp.firebase.HostingCustomDomain(
  "api-gguk-org",
  {
    project,
    siteId: project,
    customDomain: "api.gguk.org",
    waitDnsVerification: false,
  },
  { dependsOn: [version] },
);
