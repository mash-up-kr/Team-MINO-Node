import type { Pagination } from "../../common/pagination/pagination.type";
import type { PlaceCategoryGroup, PlaceProvider } from "../place/place.schema";
import type { UserAvatar } from "../user/user.schema";

/**
 * 핀 목록 조회 조건 — HTTP 쿼리(ListPinsQuery)를 repository가 쓸 모양으로 옮긴 것.
 *
 * distance 정렬에만 좌표가 붙는 걸 타입으로 표현해, repository에서 좌표 존재를
 * 단언(as number)하지 않아도 되게 한다.
 */
export type PinListSort =
  | { type: "latest" }
  | { type: "ggukPick" }
  | { type: "commented" }
  | { type: "distance"; lat: number; lng: number };

/** roomId를 지정하면 그 방만, 아니면 요청 유저가 속한 모든 활성 방. */
export type PinListScope =
  | { type: "room"; roomId: string }
  | { type: "allRooms" };

export type PinListCriteria = {
  scope: PinListScope;
  /** null이면 카테고리 필터 없음(전체). */
  categoryGroup: PlaceCategoryGroup | null;
  sort: PinListSort;
};

export type PlaceResponse = {
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
  createdAt: Date;
  updatedAt: Date;
};

export type PinAuthorResponse = {
  userId: string;
  nickname: string;
  avatar: UserAvatar | null;
};

export type PinResponse = {
  id: string;
  roomId: string;
  place: PlaceResponse;
  /** places.images가 pins로 이동 예정(DB 변경)이라 응답에서 먼저 핀 소속으로 내린다 */
  images: string[];
  createdBy: PinAuthorResponse | null;
  createdAt: Date;
};

export type PinDetailResponse = PinResponse & {
  sourceUrl: string | null;
};

export type PinListResponse = {
  data: PinResponse[];
  pagination?: Pagination;
};

export type PlaceRow = {
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
  externalUrl: string | null;
  images: string[] | null;
  createdAt: Date;
  updatedAt: Date;
};

/** createdBy가 없는 핀은 leftJoin 결과가 null 필드 객체로 오므로 userId로 판별한다. */
export type AuthorJoinRow = {
  userId: string | null;
  nickname: string | null;
  avatar: UserAvatar | null;
} | null;

export type PinRow = {
  id: string;
  roomId: string;
  placeId: string;
  sourceId: string | null;
  /** 이 핀이 만들어진 게시물의 이미지. 복제 시 그대로 물려준다. */
  images: string[] | null;
};

/** 요청 유저 관점의 핀 조회 행 — 소속 방 멤버십 검증을 본 쿼리에서 함께 내린다. */
export type PinForUserRow = PinRow & {
  isMember: boolean;
};

/** 복제 대상 방 검증 행 — 활성 방 존재와 요청 유저 멤버십을 한 쿼리로 판정한다. */
export type TargetRoomRow = {
  roomId: string;
  isMember: boolean;
};

export type PinJoinRow = {
  id: string;
  roomId: string;
  createdAt: Date;
  place: PlaceRow;
  author: AuthorJoinRow;
};

export function toPlaceResponse(row: PlaceRow): PlaceResponse {
  return {
    id: row.id,
    provider: row.provider,
    providerPlaceId: row.providerPlaceId,
    name: row.name,
    address: row.address,
    city: row.city,
    district: row.district,
    lat: row.lat,
    lng: row.lng,
    category: row.category,
    phone: row.phone,
    mapUrl: row.externalUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPinResponse(row: PinJoinRow): PinResponse {
  const author =
    row.author?.userId != null && row.author.nickname != null
      ? {
          userId: row.author.userId,
          nickname: row.author.nickname,
          avatar: row.author.avatar,
        }
      : null;

  return {
    id: row.id,
    roomId: row.roomId,
    place: toPlaceResponse(row.place),
    images: row.place.images ?? [],
    createdBy: author,
    createdAt: row.createdAt,
  };
}
