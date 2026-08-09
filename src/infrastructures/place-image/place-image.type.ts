export interface StoredImage {
  // Vertex에 넘길 gs:// URI.
  gsUri: string;
  // 업로드된 객체의 MIME 타입(예: "image/jpeg").
  mediaType: string;
}
