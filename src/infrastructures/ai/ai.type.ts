import type { GenericSchema } from "valibot";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image";
  // gs:// URI 또는 http(s) URL. Vertex는 gs://만 robots 검사 없이 읽는다.
  url: string;
  // fileData로 넘길 때 Vertex가 요구하는 MIME 타입(예: "image/jpeg").
  mediaType?: string;
}

export type ContentPart = TextPart | ImagePart;

export interface AiServiceInterface {
  extract<T>(schema: GenericSchema<T>, content: ContentPart[]): Promise<T>;
}
