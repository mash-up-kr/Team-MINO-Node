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
  // gs:// URI는 확장자로 타입을 유추할 수 없어 생략하면 요청이 실패한다.
  mediaType: string;
}

export type ContentPart = TextPart | ImagePart;

export interface AiServiceInterface {
  extract<T>(schema: GenericSchema<T>, content: ContentPart[]): Promise<T>;
}
