import * as v from "valibot";
import type { SchemaObject } from "../swagger/schema";
import { MAX_PAGE_SIZE } from "./pagination.constant";

/** 쿼리 파라미터는 문자열로 들어오므로 숫자 변환을 포함한다. */
export const pageQuerySchema = v.pipe(
  v.string(),
  v.regex(/^\d+$/, "page는 0 이상의 정수여야 합니다."),
  v.transform(Number),
  v.minValue(0),
);

export const pageSizeQuerySchema = v.pipe(
  v.string(),
  v.regex(/^\d+$/, `pageSize는 1~${MAX_PAGE_SIZE} 정수여야 합니다.`),
  v.transform(Number),
  v.minValue(1),
  v.maxValue(MAX_PAGE_SIZE),
);

export const paginationApiSchema: SchemaObject = {
  type: "object",
  description: "목록 API 공통 페이지네이션 메타 (offset 기반)",
  properties: {
    pageSize: { type: "integer", example: 20 },
    page: { type: "integer", example: 0, description: "0부터 시작" },
    hasNext: { type: "boolean" },
  },
};
