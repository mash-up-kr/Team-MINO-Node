import type { SchemaObject } from "./schema";

export function dataSchema(s: SchemaObject): SchemaObject {
  return { type: "object", properties: { data: s } };
}

export function dataArraySchema(
  s: SchemaObject,
  opts?: { paginated?: boolean },
): SchemaObject {
  return {
    type: "object",
    properties: {
      data: { type: "array", items: s },
      ...(opts?.paginated ? { pagination: PAGINATION_SCHEMA } : {}),
    },
  };
}

export const OK_RESPONSE_SCHEMA: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      required: ["ok"],
      properties: { ok: { type: "boolean", example: true } },
    },
  },
};

export const ERROR_RESPONSE_SCHEMA: SchemaObject = {
  type: "object",
  required: ["errorCode", "message"],
  properties: {
    errorCode: { type: "string", example: "FORBIDDEN" },
    message: { type: "string" },
  },
};

export const PAGINATION_SCHEMA: SchemaObject = {
  type: "object",
  required: ["pageSize", "page", "hasNext"],
  properties: {
    pageSize: { type: "integer", example: 20 },
    page: { type: "integer", description: "0부터 시작", example: 0 },
    hasNext: { type: "boolean" },
  },
};
