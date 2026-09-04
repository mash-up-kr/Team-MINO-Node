export interface StoredImage {
  // Vertex에 넘길 gs:// URI.
  gsUri: string;
  // 클라이언트가 그대로 렌더링하는 공개 HTTPS URL(버킷 공개 읽기 허용됨).
  publicUrl: string;
  // 업로드된 객체의 MIME 타입(예: "image/jpeg").
  mediaType: string;
}
