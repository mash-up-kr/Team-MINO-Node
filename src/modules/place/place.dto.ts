import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { SchemaObject } from "../../common/swagger/schema";

export const createPlaceRequestSchema = v.object({
  method: v.picklist(["instagram_url"]),
  data: v.object({
    url: v.pipe(v.string(), v.url(), v.regex(/instagram\.com/)),
  }),
});

export type CreatePlaceRequest = v.InferOutput<typeof createPlaceRequestSchema>;

export const createPlaceRequestApiSchema = toJsonSchema(
  createPlaceRequestSchema,
) as SchemaObject;

export const errorResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "ENQUEUE_FAILED" },
    message: { type: "string", example: "작업을 큐에 등록하지 못했습니다." },
  },
};
