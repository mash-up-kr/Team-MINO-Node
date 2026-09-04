import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { project, region } from "@/config";
import { enabledServices } from "@/resources/apis";
import { developersGroup, serverServiceAccount } from "@/resources/identity";

/**
 * 인스타 게시글 이미지를 담는 버킷. 두 가지 용도로 읽힌다.
 *
 * 1) Vertex Gemini. 인스타 CDN 이미지를 URL로 읽지 못하므로(인스타 robots.txt가 Googlebot
 *    포함 모든 봇을 차단) 앱이 내려받아 여기에 올리고 gs:// URI로 넘긴다. Vertex는 같은
 *    프로젝트의 GCS 객체를 robots 검사 없이 읽는다.
 * 2) 앱/웹 클라이언트. 저장된 장소의 썸네일을 https:// URL로 직접 띄운다.
 *
 * env 시크릿(team-mino-env-{local,prod})과 같은 축으로 APP_ENV별 버킷을 둔다. 로컬 실행이
 * 운영 버킷에 이미지를 쌓지 않도록 분리하는 것이 목적이다.
 */
function createPlaceImagesBucket(appEnv: "local" | "prod") {
  const bucket = new gcp.storage.Bucket(
    `team-mino-place-images-${appEnv}`,
    {
      name: `team-mino-place-images-${appEnv}`,
      location: region,
      uniformBucketLevelAccess: true,
    },
    { dependsOn: enabledServices },
  );

  /*
   * Vertex가 gs:// 객체를 읽을 때는 호출자 신원이 아니라 Vertex AI 서비스 에이전트로 접근한다.
   * 이 권한이 없으면 gs:// 전달이 권한 오류로 실패하므로 두 버킷 모두에 부여한다.
   */
  new gcp.storage.BucketIAMMember(
    `team-mino-place-images-${appEnv}-vertex-reader`,
    {
      bucket: bucket.name,
      role: "roles/storage.objectViewer",
      member: pulumi.interpolate`serviceAccount:${vertexServiceAgent.email}`,
    },
  );

  /*
   * 클라이언트가 <img src>로 바로 띄우도록 공개 읽기를 연다. 서명 URL은 만료되므로
   * places.images에 담을 수 없다. 원본은 인스타에 이미 공개된 이미지이고 객체 경로도
   * 공개된 shortcode 기반이라, 이 버킷으로 새로 노출되는 정보는 없다.
   */
  new gcp.storage.BucketIAMMember(
    `team-mino-place-images-${appEnv}-public-reader`,
    {
      bucket: bucket.name,
      role: "roles/storage.objectViewer",
      member: "allUsers",
    },
  );

  return bucket;
}

const vertexServiceAgent = new gcp.projects.ServiceIdentity(
  "team-mino-aiplatform-agent",
  { project, service: "aiplatform.googleapis.com" },
  { dependsOn: enabledServices },
);

export const placeImagesLocalBucket = createPlaceImagesBucket("local");
export const placeImagesProdBucket = createPlaceImagesBucket("prod");

// Cloud Run runtime SA는 prod 버킷에만 쓴다(env 시크릿에서 prod만 읽는 것과 같은 범위).
new gcp.storage.BucketIAMMember("team-mino-place-images-prod-server-writer", {
  bucket: placeImagesProdBucket.name,
  role: "roles/storage.objectAdmin",
  member: pulumi.interpolate`serviceAccount:${serverServiceAccount.email}`,
});

// 개발자는 로컬 버킷에만 쓴다. 운영 버킷은 프로젝트 viewer 권한으로 읽기만 가능하다.
new gcp.storage.BucketIAMMember("team-mino-place-images-local-developers", {
  bucket: placeImagesLocalBucket.name,
  role: "roles/storage.objectAdmin",
  member: developersGroup,
});
