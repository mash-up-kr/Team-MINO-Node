export interface InstagramAddress {
  streetAddress: string;
  zipCode: string;
  cityName: string;
  regionName: string;
  countryCode: string;
}

export interface InstagramLocation {
  id: string;
  name: string;
  slug: string;
  hasPublicPage: boolean;
  address: InstagramAddress | null;
}

export interface InstagramOwner {
  id: string;
  username: string;
  fullName: string;
}

export interface ScrapedPost {
  owner: InstagramOwner; // 계정명 등 정보
  shortcode: string; // 게시글 식별자
  typename: "image" | "video" | "carousel";
  caption: string | null; // 게시글 본문
  imageUrls: string[]; // 사진 + 영상 썸네일
  location: InstagramLocation | null; // 위치 정보
}
