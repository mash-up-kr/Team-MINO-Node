// Instagram 내부 GraphQL 응답의 원본(raw) 형태.
// 우리가 실제로 사용하는 필드만 선언한다. (scraper.type.ts 의 정규화된 타입과 분리)

export interface IgCaptionEdge {
  node: { text: string };
}

export interface IgSidecarChild {
  node: { display_url: string };
}

export interface IgOwner {
  id: string;
  username: string;
  full_name: string;
}

export interface IgLocation {
  id: string;
  name: string;
  slug: string;
  has_public_page: boolean;
  address_json: string | null; // JSON 문자열로 옴
}

export interface IgShortcodeMedia {
  __typename: string;
  shortcode: string;
  display_url: string;
  owner: IgOwner;
  location: IgLocation | null;
  edge_media_to_caption: { edges: IgCaptionEdge[] };
  edge_sidecar_to_children?: { edges: IgSidecarChild[] };
}

export interface IgGraphqlResponse {
  data?: { xdt_shortcode_media?: IgShortcodeMedia | null };
}
