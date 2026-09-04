export interface StoredImage {
  // Vertex에 넘길 gs:// URI.
  gsUri: string;
  // 앱/웹이 직접 띄울 공개 HTTPS URL. places.images에 남는 값.
  publicUrl: string;
  // 업로드된 객체의 MIME 타입(예: "image/jpeg").
  mediaType: string;
}
