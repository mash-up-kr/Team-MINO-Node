import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { SchemaObject } from "../../common/swagger/schema";

export const COMMENT_CONTENT_MAX_LENGTH = 500;
export const COMMENT_PAGE_DEFAULT = 0;
export const COMMENT_PAGE_SIZE_DEFAULT = 20;
export const COMMENT_PAGE_SIZE_MAX = 100;

export const pinIdParamSchema = v.pipe(v.string(), v.uuid());

export const createCommentRequestSchema = v.object({
  content: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(COMMENT_CONTENT_MAX_LENGTH),
  ),
});

const pageSchema = v.pipe(
  v.string(),
  v.regex(/^\d+$/),
  v.transform(Number),
  v.integer(),
  v.minValue(0),
);

const pageSizeSchema = v.pipe(
  pageSchema,
  v.minValue(1),
  v.maxValue(COMMENT_PAGE_SIZE_MAX),
);

export const commentListQuerySchema = v.object({
  page: v.optional(pageSchema, String(COMMENT_PAGE_DEFAULT)),
  pageSize: v.optional(pageSizeSchema, String(COMMENT_PAGE_SIZE_DEFAULT)),
});

export type CreateCommentRequest = v.InferOutput<
  typeof createCommentRequestSchema
>;
export type CommentListQuery = v.InferOutput<typeof commentListQuerySchema>;

export const createCommentRequestApiSchema = toJsonSchema(
  createCommentRequestSchema,
  { errorMode: "ignore" },
) as SchemaObject;

const authorApiSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    nickname: { type: "string", example: "지은" },
    avatar: {
      type: "object",
      nullable: true,
      properties: { id: { type: "integer", example: 3 } },
    },
  },
};

const commentApiSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    content: {
      type: "string",
      minLength: 1,
      maxLength: COMMENT_CONTENT_MAX_LENGTH,
    },
    createdAt: { type: "string", format: "date-time" },
    author: authorApiSchema,
    canDelete: { type: "boolean" },
  },
};

export const commentResponseApiSchema: SchemaObject = {
  type: "object",
  properties: { data: commentApiSchema },
};

export const commentListResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        comments: { type: "array", items: commentApiSchema },
        pagination: {
          type: "object",
          properties: {
            page: { type: "integer", example: COMMENT_PAGE_DEFAULT },
            pageSize: { type: "integer", example: COMMENT_PAGE_SIZE_DEFAULT },
            hasNext: { type: "boolean" },
          },
        },
      },
    },
  },
};

export const errorResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "NOT_ROOM_MEMBER" },
    message: { type: "string", example: "방의 멤버가 아닙니다." },
  },
};
