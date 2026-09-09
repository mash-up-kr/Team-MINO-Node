import * as v from "valibot";
import type { SchemaObject } from "../../common/swagger/schema";
import { maxGraphemes } from "../../common/text/grapheme";
import { REPORT_REASONS, REPORT_TARGET_TYPES } from "./report.schema";

export const REPORT_DETAIL_MAX_LENGTH = 500;

export const createReportRequestSchema = v.object({
  targetType: v.picklist(
    [...REPORT_TARGET_TYPES],
    "신고 대상 종류가 올바르지 않습니다.",
  ),
  targetId: v.pipe(v.string(), v.uuid("신고 대상 ID가 올바르지 않습니다.")),
  reason: v.picklist([...REPORT_REASONS], "신고 사유가 올바르지 않습니다."),
  detail: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1, "신고 내용을 입력해 주세요."),
      maxGraphemes(
        REPORT_DETAIL_MAX_LENGTH,
        `신고 내용은 ${REPORT_DETAIL_MAX_LENGTH}자 이하여야 합니다.`,
      ),
    ),
  ),
});

export type CreateReportRequest = v.InferOutput<
  typeof createReportRequestSchema
>;

export const createReportRequestApiSchema: SchemaObject = {
  type: "object",
  required: ["targetType", "targetId", "reason"],
  properties: {
    targetType: {
      type: "string",
      enum: [...REPORT_TARGET_TYPES],
      description: "pin | pin_comment | user",
    },
    targetId: { type: "string", format: "uuid" },
    reason: {
      type: "string",
      enum: [...REPORT_REASONS],
      description: "SPAM | HARASSMENT | SEXUAL | HATE | ILLEGAL | OTHER",
    },
    detail: {
      type: "string",
      description: `선택. 앞뒤 공백 제거 후 1~${REPORT_DETAIL_MAX_LENGTH}자`,
    },
  },
};

export const reportResponseApiSchema: SchemaObject = {
  type: "object",
  required: ["data"],
  properties: {
    data: {
      type: "object",
      required: ["id", "status", "createdAt"],
      properties: {
        id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["pending"], example: "pending" },
        createdAt: { type: "string", format: "date-time" },
      },
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
  "SELF_REPORT_NOT_ALLOWED",
]);
export const unidentifiedUserResponseApiSchema = createErrorResponseApiSchema([
  "UNIDENTIFIED_USER",
]);
export const duplicateReportResponseApiSchema = createErrorResponseApiSchema([
  "REPORT_ALREADY_EXISTS",
]);
export const rateLimitedResponseApiSchema = createErrorResponseApiSchema([
  "REPORT_RATE_LIMITED",
]);
