import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import {
  commentListQuerySchema,
  createCommentRequestSchema,
} from "./comment.dto";

describe("createCommentRequestSchema", () => {
  it("앞뒤 공백을 제거한 1자 코멘트를 허용한다", () => {
    const result = v.parse(createCommentRequestSchema, { content: " 한 " });

    expect(result).toEqual({ content: "한" });
  });

  it("500자 코멘트를 허용한다", () => {
    const content = "가".repeat(500);

    expect(v.parse(createCommentRequestSchema, { content })).toEqual({
      content,
    });
  });

  it("공백만 있는 코멘트를 거절한다", () => {
    const result = v.safeParse(createCommentRequestSchema, { content: " \n " });

    expect(result.success).toBe(false);
  });

  it("501자 코멘트를 거절한다", () => {
    const result = v.safeParse(createCommentRequestSchema, {
      content: "가".repeat(501),
    });

    expect(result.success).toBe(false);
  });
});

describe("commentListQuerySchema", () => {
  it("페이지 파라미터가 없으면 기본값을 적용한다", () => {
    expect(v.parse(commentListQuerySchema, {})).toEqual({
      page: 0,
      pageSize: 20,
    });
  });

  it("음수 페이지와 최대치를 넘는 pageSize를 거절한다", () => {
    const negativePage = v.safeParse(commentListQuerySchema, {
      page: "-1",
    });
    const oversizedPage = v.safeParse(commentListQuerySchema, {
      pageSize: "101",
    });

    expect(negativePage.success).toBe(false);
    expect(oversizedPage.success).toBe(false);
  });
});
