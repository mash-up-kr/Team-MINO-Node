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
      /*
       * Hosting에는 appAssociation(AUTO/NONE) 설정이 있지만 @pulumi/gcp의
       * HostingVersionConfig는 headers·redirects·rewrites만 받아 여기서 끌 수 없다.
       *
       * AUTO는 Dynamic Links가 구성된 사이트에서만 자체 AASA를 만들어 내려보내고,
       * Dynamic Links는 2025-08에 종료돼 생성 대상이 없다. 그래도 이게 켜지면
       * Cloud Run이 서빙하는 우리 AASA가 가려지므로, 배포 후
       * /.well-known/apple-app-site-association 응답이 우리 것인지 확인해야 한다.
       * 실제로 가려지면 Firebase CLI나 Hosting REST API로 NONE을 설정한다.
       */
      headers: [
        {
          glob: "**",
          headers: { "Cache-Control": "no-cache, no-store" },
        },
        /*
         * `.well-known` 두 파일은 OS가 앱 설치 시점에 가져가고 자주 바뀌지 않는다.
         * 전역 no-store가 걸리면 매번 재요청하게 되므로 여기서만 되돌린다.
         * 실제 값은 Cloud Run 응답 헤더가 정한다(app-link.controller.ts).
         */
        {
          glob: "/.well-known/**",
          headers: { "Cache-Control": "public, max-age=3600" },
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

/*
 * 초대 링크 도메인. 링크가 gguk.org/r/{code} 라서 apex여야 한다.
 *
 * 같은 Hosting 사이트에 도메인만 하나 더 붙여 같은 Cloud Run으로 보낸다.
 * 앱이 검증하는 대상이 이 도메인이므로, `.well-known` 두 파일이 여기서
 * 리다이렉트 없이 200으로 나와야 한다.
 *
 * apex 레코드도 Cloudflare에 수동 등록해야 한다(위 api와 동일).
 */
export const inviteDomain = new gcp.firebase.HostingCustomDomain(
  "gguk-org",
  {
    project,
    siteId: project,
    customDomain: "gguk.org",
    waitDnsVerification: false,
  },
  { dependsOn: [version] },
);
