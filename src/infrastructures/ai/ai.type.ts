import type { GenericSchema } from "valibot";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image";
  url: string;
}

export type ContentPart = TextPart | ImagePart;

export interface AiServiceInterface {
  extract<T>(schema: GenericSchema<T>, content: ContentPart[]): Promise<T>;
}
