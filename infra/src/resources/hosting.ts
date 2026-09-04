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
       * ⚠️ 이 config를 바꾸면 firebase.json을 다시 배포해야 한다.
       *
       * Hosting의 appAssociation 기본값 AUTO는 프로젝트에 등록된 앱 정보로
       * `.well-known` 두 파일을 자동 생성하고, 그게 아래 rewrites보다 우선한다.
       * 실제로 그 상태에서 Play 앱 서명 키가 빠진 assetlinks.json이 서빙돼
       * 스토어 설치본에서만 App Links 검증이 실패했다.
       *
       * 꺼야 하는데 @pulumi/gcp의 HostingVersionConfig는 headers·redirects·rewrites만
       * 받아 여기서 표현할 수 없다. 그래서 저장소 루트 firebase.json이 같은 설정에
       * appAssociation: "NONE"을 더해 Firebase CLI로 배포한다.
       *
       * 문제는 HostingVersion이 불변이라, 이 config가 바뀌면 Pulumi가 새 버전을
       * 만들어 릴리스하고 appAssociation이 AUTO로 돌아간다는 점이다. 아무도
       * `.well-known`을 보지 않으므로 조용히 되돌아간다. 바꿨다면 반드시
       *   npx firebase-tools deploy --only hosting --project team-mino-prod
       * 를 다시 돌리고 응답이 우리 것인지 확인한다.
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
