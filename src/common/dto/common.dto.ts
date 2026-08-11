import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { SchemaObject } from "../swagger/schema";

export const nicknameSchema = v.pipe(
  v.string(),
  v.minLength(2),
  v.maxLength(15),
  v.regex(/^[가-힣a-zA-Z ]{2,15}$/),
);
export const nicknameApiSchema = toJsonSchema(nicknameSchema) as SchemaObject;

export const avatarSchema = v.object({ id: v.number() });
export const avatarApiSchema = toJsonSchema(avatarSchema) as SchemaObject;

export const uuidSchema = v.pipe(v.string(), v.uuid());
export const uuidApiSchema = toJsonSchema(uuidSchema) as SchemaObject;

export const dateTimeSchema = v.pipe(v.string(), v.isoTimestamp());
export const dateTimeApiSchema = toJsonSchema(dateTimeSchema) as SchemaObject;

const pageParamSchema = v.pipe(
  v.unknown(),
  v.transform((value) => Number(value)),
  v.number(),
);

export const pageQuerySchema = v.object({
  page: v.optional(v.pipe(pageParamSchema, v.minValue(0)), 0),
  pageSize: v.optional(
    v.pipe(pageParamSchema, v.minValue(1), v.maxValue(100)),
    20,
  ),
});

export type PageQuery = v.InferOutput<typeof pageQuerySchema>;

export const pageQueryApiSchema: SchemaObject = {
  type: "object",
  properties: {
    page: {
      type: "integer",
      minimum: 0,
      default: 0,
      description: "페이지 번호 (0부터 시작)",
    },
    pageSize: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: 20,
      description: "페이지 크기",
    },
  },
};

export type OkResult = { ok: boolean };
