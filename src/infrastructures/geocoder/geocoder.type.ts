export interface Coordinate {
  lat: number;
  lng: number;
}

export type AreaType = "landmark" | "address" | "region";

export interface GeoQuery {
  areaName: string;
  areaType?: AreaType;
  placeName: string;
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
  search(query: GeoQuery): Promise<GeoCandidate[]>;
}
