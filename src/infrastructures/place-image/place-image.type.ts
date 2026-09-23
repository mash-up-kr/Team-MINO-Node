export interface StoredVideo {
  // Vertex에 넘길 gs:// URI. 클라이언트에 내려주지 않으므로 공개 URL은 없다.
  gsUri: string;
  // 예: "video/mp4".
  mediaType: string;
}

export interface StoredImage {
  // Vertex에 넘길 gs:// URI.
  gsUri: string;
  // 앱/웹이 직접 띄울 공개 HTTPS URL. pins.images에 남는 값.
  publicUrl: string;
  // 업로드된 객체의 MIME 타입(예: "image/jpeg").
  mediaType: string;
}
