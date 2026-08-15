export interface Coordinate {
  lat: number;
  lng: number;
}

export const AREA_TYPES = ["landmark", "address", "region"] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export interface GeoQuery {
  areaName: string;
  areaType?: AreaType;
  placeName: string;
  countryCode: string;
}

export interface GeoCandidate {
  provider: "kakao" | "google";
  providerPlaceId: string;
  placeName: string;
  address: string;
  coordinate: Coordinate;
  distance?: number;
  mapUrl?: string;
  phone?: string;
  category?: string;
}

export interface GeocoderProvider {
  readonly name: GeoCandidate["provider"];
  supports(query: GeoQuery): boolean;
  search(query: GeoQuery): Promise<GeoCandidate[]>;
}
