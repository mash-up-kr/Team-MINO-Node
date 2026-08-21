export interface ScrapedLocation {
  id: string;
  name: string;
  // 인스타가 로그아웃 응답에서 주소(address_json)를 빼고 좌표만 남겼다.
  // 좌표는 geocoder에 그대로 넘길 수 있다. 광역 태그는 좌표가 없다.
  lat: number | null;
  lng: number | null;
}

export interface ScrapedOwner {
  id: string;
  username: string;
  fullName: string;
}

export interface ScrapedPost {
  owner: ScrapedOwner;
  shortcode: string;
  typename: "image" | "video" | "carousel";
  caption: string | null;
  imageUrls: string[]; // 사진 + 영상 썸네일
  location: ScrapedLocation | null;
}

/**
 * 인스타 게시글을 가져오는 한 가지 경로. 같은 게시글을 서로 다른 표면에서 읽는
 * 구현들이 이 인터페이스를 공유하고, ScraperService가 우선순위대로 순회한다.
 */
export interface InstagramProvider {
  readonly name: "polaris-json" | "polaris-html" | "embed";
  /**
   * 이 경로로 못 얻으면 `null`을 돌려 다음 경로로 넘긴다.
   *
   * 게시글 부재를 `null`로 표현하면 뒤 경로를 헛돌고 최종 에러도 502(재시도 대상)가
   * 되므로, 부재가 확실할 때만 AppException을 던져 체인을 끝낸다.
   */
  fetch(shortcode: string): Promise<ScrapedPost | null>;
}
