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

/*
 * job 조회/워커 경로 파라미터. uuid 검증 없이 DB에 넘기면 캐스팅 오류(22P02)가
 * 500으로 새어 나가므로 입구에서 400으로 거른다.
 */
export const jobIdSchema = v.pipe(v.string(), v.uuid());

export const createPlaceResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        jobId: { type: "string", format: "uuid" },
      },
      required: ["jobId"],
    },
  },
};

export const errorResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "ENQUEUE_FAILED" },
    message: { type: "string", example: "작업을 큐에 등록하지 못했습니다." },
  },
};
