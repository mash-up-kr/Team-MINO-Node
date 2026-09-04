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
      /*
       * "inherited"는 공개 차단을 끄는 값이 아니라 상위(조직·폴더·프로젝트) 정책을
       * 따르는 값이다. 아래 allUsers 바인딩은 상위 정책이 공개를 허용할 때만 유효하다.
       * team-mino-prod의 유효 정책은 storage.publicAccessPrevention enforce: false라
       * 현재는 허용된다. 정책이 켜지면 바인딩이 남아 있어도 익명 요청이 거부된다.
       *
       * "enforced"를 지우는 것으로는 부족하다. 이 필드는 Optional+Computed라
       * 설정에서 빼면 diff가 생기지 않고 이전 값이 그대로 남는다.
       */
      publicAccessPrevention: "inherited",
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
   * places.images에 담을 수 없다.
   *
   * objectViewer가 아니라 legacyObjectReader인 이유: objectViewer에는 objects.list가
   * 딸려 와서 버킷 주소만으로 전체 객체 목록이 익명으로 열린다. 개별 이미지는 이미
   * 인스타에 공개돼 있지만, "우리 사용자들이 저장한 글 전체 목록"은 인스타 어디에도
   * 없는 정보다. legacyObjectReader는 objects.get만 줘서 경로를 아는 객체만 열린다.
   */
  new gcp.storage.BucketIAMMember(
    `team-mino-place-images-${appEnv}-public-reader`,
    {
      bucket: bucket.name,
      role: "roles/storage.legacyObjectReader",
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
