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

export interface VideoPart {
  type: "video";
  // GCS에 올린 영상의 gs:// URI. 이미지와 같은 이유로 gs://만 쓴다.
  url: string;
  // 예: "video/mp4". fileData로 넘길 때 필수.
  mediaType: string;
}

export type ContentPart = TextPart | ImagePart | VideoPart;

export interface ExtractOptions {
  // 기본은 AiService의 상수(30초). 영상이 실리면 길어지므로 호출별로 늘릴 수 있다.
  timeoutMs?: number;
}

export interface AiServiceInterface {
  extract<T>(
    schema: GenericSchema<T>,
    content: ContentPart[],
    options?: ExtractOptions,
  ): Promise<T>;
}
