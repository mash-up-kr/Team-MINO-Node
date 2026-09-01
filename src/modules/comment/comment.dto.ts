import * as v from "valibot";
import { COLOR_KEYS } from "../../common/colors/color.constant";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from "../../common/pagination/pagination.constant";
import {
  pageQuerySchema,
  pageSizeQuerySchema,
  paginationApiSchema,
} from "../../common/pagination/pagination.dto";
import type { SchemaObject } from "../../common/swagger/schema";
import { maxGraphemes } from "../../common/text/grapheme";

export const COMMENT_CONTENT_MAX_LENGTH = 200;

export const pinIdParamSchema = v.pipe(v.string(), v.uuid());
export const commentIdParamSchema = v.pipe(v.string(), v.uuid());

export const createCommentRequestSchema = v.object({
  content: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    maxGraphemes(
      COMMENT_CONTENT_MAX_LENGTH,
      `코멘트는 ${COMMENT_CONTENT_MAX_LENGTH}자 이하여야 합니다.`,
    ),
  ),
});

export const commentListQuerySchema = v.object({
  page: v.optional(pageQuerySchema, String(DEFAULT_PAGE)),
  pageSize: v.optional(pageSizeQuerySchema, String(DEFAULT_PAGE_SIZE)),
});

export type CreateCommentRequest = v.InferOutput<
  typeof createCommentRequestSchema
>;
export type CommentListQuery = v.InferOutput<typeof commentListQuerySchema>;

export const createCommentRequestApiSchema: SchemaObject = {
  type: "object",
  required: ["content"],
  properties: {
    content: {
      type: "string",
      description: "앞뒤 공백 제거 후 1~200자",
    },
  },
};

const authorApiSchema: SchemaObject = {
  type: "object",
  required: ["id", "nickname", "avatar"],
  properties: {
    id: { type: "string", format: "uuid" },
    nickname: { type: "string", minLength: 2, maxLength: 15, example: "지은" },
    avatar: {
      type: "object",
      nullable: true,
      required: ["color"],
      properties: {
        color: { type: "string", enum: [...COLOR_KEYS], example: "red" },
      },
    },
  },
};

const commentApiSchema: SchemaObject = {
  type: "object",
  required: ["id", "content", "createdAt", "author", "canDelete"],
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
  required: ["data"],
  properties: { data: commentApiSchema },
};

export const commentListResponseApiSchema: SchemaObject = {
  type: "object",
  required: ["data", "pagination"],
  properties: {
    data: { type: "array", items: commentApiSchema },
    pagination: {
      ...paginationApiSchema,
      required: ["page", "pageSize", "hasNext"],
    },
  },
};

export const okResponseApiSchema: SchemaObject = {
  type: "object",
  required: ["data"],
  properties: {
    data: {
      type: "object",
      required: ["ok"],
      properties: { ok: { type: "boolean", example: true } },
    },
  },
};

function createErrorResponseApiSchema(
  errorCodes: readonly string[],
): SchemaObject {
  return {
    type: "object",
    required: ["errorCode", "message"],
    properties: {
      errorCode: {
        type: "string",
        enum: [...errorCodes],
        example: errorCodes[0],
      },
      message: { type: "string" },
    },
  };
}

export const validationErrorResponseApiSchema = createErrorResponseApiSchema([
  "VALIDATION_ERROR",
]);
export const unidentifiedUserResponseApiSchema = createErrorResponseApiSchema([
  "UNIDENTIFIED_USER",
]);
export const notRoomMemberResponseApiSchema = createErrorResponseApiSchema([
  "NOT_ROOM_MEMBER",
]);
export const pinNotFoundResponseApiSchema = createErrorResponseApiSchema([
  "PIN_NOT_FOUND",
]);
export const commentDeleteForbiddenResponseApiSchema =
  createErrorResponseApiSchema(["NOT_ROOM_MEMBER", "COMMENT_DELETE_FORBIDDEN"]);
export const commentDeleteNotFoundResponseApiSchema =
  createErrorResponseApiSchema(["PIN_NOT_FOUND", "COMMENT_NOT_FOUND"]);
