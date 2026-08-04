import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { project, region } from "@/config";
import { enabledServices } from "@/resources/apis";
import { developersGroup, serverServiceAccount } from "@/resources/identity";

/**
 * 인스타 게시글 이미지를 담는 버킷. Vertex Gemini는 인스타 CDN 이미지를 URL로 읽지 못한다
 * (인스타 robots.txt가 Googlebot 포함 모든 봇을 차단). 그래서 앱이 이미지를 내려받아 여기에
 * 올리고 gs:// URI로 넘긴다. Vertex는 같은 프로젝트의 GCS 객체를 robots 검사 없이 읽는다.
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
      // 게시글 이미지는 공개 대상이 아니다. 접근은 아래 IAM으로만 허용한다.
      publicAccessPrevention: "enforced",
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
