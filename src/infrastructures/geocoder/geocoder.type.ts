export interface Coordinate {
  lat: number;
  lng: number;
}

export interface GeoQuery {
  areaName: string;
  placeName: string;
}

export interface GeoCandidate {
  provider: "kakao" | "google";
  placeName: string;
  address: string;
  coordinate: Coordinate;
  distance?: number;
  url?: string;
  phone?: string;
  category?: string;
}

export interface GeocoderProvider {
  name: GeoCandidate["provider"];
  search(query: GeoQuery): Promise<GeoCandidate[]>;
}
