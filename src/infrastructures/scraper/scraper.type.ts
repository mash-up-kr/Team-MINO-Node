export interface ScrapedAddress {
  // 인스타가 주는 대로 통과 — 부분만 오거나 빈 문자열일 수 있어 전부 optional.
  streetAddress?: string;
  zipCode?: string;
  cityName?: string;
  regionName?: string;
  countryCode?: string;
}

export interface ScrapedLocation {
  id: string;
  name: string;
  slug: string;
  hasPublicPage: boolean;
  address: ScrapedAddress | null;
}

export interface ScrapedOwner {
  id: string;
  username: string;
  fullName: string;
}

export interface ScrapedPost {
  owner: ScrapedOwner; // 계정명 등 정보
  shortcode: string; // 게시글 식별자
  typename: "image" | "video" | "carousel";
  caption: string | null; // 게시글 본문
  imageUrls: string[]; // 사진 + 영상 썸네일
  location: ScrapedLocation | null; // 위치 정보
}
