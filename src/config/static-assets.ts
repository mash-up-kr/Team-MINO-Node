/**
 * 초대 랜딩이 쓰는 정적 파일(SUITE 폰트, 일러스트)의 위치와 캐시 정책.
 *
 * Cloud Run이 직접 서빙한다. Firebase Hosting에도 올리면 배포 경로가 둘로 갈려서
 * (CI가 굽는 컨테이너 이미지 / 사람이 돌리는 firebase deploy) 이미지 안의 파일을
 * 바꿔도 Hosting에 남은 옛 파일이 그대로 나간다. `.well-known`에서 이미 겪은
 * 문제라, 정적 파일은 한쪽에서만 낸다(firebase.json의 ignore).
 *
 * 경로는 프로세스의 작업 디렉터리 기준이다. 로컬은 저장소 루트, 컨테이너는
 * /app이고 Dockerfile이 이 디렉터리를 그대로 복사한다.
 */
export const STATIC_ASSETS_ROOT = "public";

/**
 * 파일명에 내용 해시가 없으므로 immutable은 쓰지 않는다. 에셋을 교체하면
 * 하루 안에 갈린다. Hosting 쪽 헤더 규칙(firebase.json, infra/hosting.ts)도
 * 같은 값이어야 CDN이 원본까지 되묻지 않는다.
 */
export const STATIC_ASSETS_CACHE_CONTROL = "public, max-age=86400";
