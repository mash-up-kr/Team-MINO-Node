import type { PlaceProvider } from "../place/place.schema";
import type { UserAvatar } from "../user/user.schema";

export const SORT_OPTIONS = ["ggukPick", "latest", "nearby"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const LABEL_GROUPS = [
  "worthVisiting",
  "manyComments",
  "manySaves",
  "manyViews",
] as const;
export type LabelGroup = (typeof LABEL_GROUPS)[number];

/** 라벨 판정에 쓰는 그룹별 지표. `worthVisiting`은 나머지 자리라 지표가 없다. */
export type LabelMetric = Exclude<LabelGroup, "worthVisiting">;

export type CardPlaceResponse = {
  id: string;
  provider: PlaceProvider;
  providerPlaceId: string;
  name: string;
  address: string;
  city: string | null;
  district: string | null;
  lat: number;
  lng: number;
  category: string | null;
  phone: string | null;
  /** places.external_url — 컬럼명도 map_url로 변경 예정이라 응답 필드를 먼저 맞춘다 */
  mapUrl: string | null;
};

export type CardAuthorResponse = {
  userId: string;
  nickname: string;
  avatar: UserAvatar | null;
};

export type CardResponse = {
  id: string;
  roomId: string;
  place: CardPlaceResponse;
  /** places.images가 pins로 이동 예정(DB 변경)이라 응답에서 먼저 핀 소속으로 내린다 */
  images: string[];
  createdBy: CardAuthorResponse | null;
  createdAt: Date;
  labelGroup: LabelGroup;
};

/** 저장된 장소의 원본 행. 응답 매핑 전 단계다. */
export type CandidatePlaceRow = Omit<CardPlaceResponse, "mapUrl"> & {
  externalUrl: string | null;
  images: string[] | null;
};

/** createdBy가 없는 핀은 leftJoin 결과가 null 필드 객체로 오므로 userId로 판별한다. */
export type CandidateAuthorRow = {
  userId: string | null;
  nickname: string | null;
  avatar: UserAvatar | null;
} | null;

/** 라벨 배정 전의 후보 한 건. 지표 3종과 묵힘을 함께 싣는다. */
export type CandidateRow = {
  id: string;
  roomId: string;
  createdAt: Date;
  /**
   * 마지막으로 이 핀을 열어본 시점. 연 적이 없으면 저장 시점이다.
   * `가볼 만한 곳` 선발과 `ggukPick` 후보 정렬이 같이 쓴다.
   */
  staleness: Date;
  place: CandidatePlaceRow;
  author: CandidateAuthorRow;
  manyComments: number;
  manySaves: number;
  manyViews: number;
};

export function toCardResponse(
  row: CandidateRow,
  labelGroup: LabelGroup,
): CardResponse {
  const author =
    row.author?.userId != null && row.author.nickname != null
      ? {
          userId: row.author.userId,
          nickname: row.author.nickname,
          avatar: row.author.avatar,
        }
      : null;

  const { externalUrl, images, ...place } = row.place;

  return {
    id: row.id,
    roomId: row.roomId,
    place: { ...place, mapUrl: externalUrl },
    images: images ?? [],
    createdBy: author,
    createdAt: row.createdAt,
    labelGroup,
  };
}
