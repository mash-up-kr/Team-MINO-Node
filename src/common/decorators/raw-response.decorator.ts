import { SetMetadata } from "@nestjs/common";

export const RAW_RESPONSE_KEY = "rawResponse";

/**
 * 공통 `{ data }` 봉투를 씌우지 않는다.
 *
 * 응답 형태를 우리가 정할 수 없는 라우트에 쓴다. 예를 들어
 * `.well-known/apple-app-site-association`은 OS가 형식을 검사하므로 한 겹만
 * 덧씌워도 파일 전체가 무시되고, 랜딩은 HTML이라 봉투를 씌울 수 없다.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
