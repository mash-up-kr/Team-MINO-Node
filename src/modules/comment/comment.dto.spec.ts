import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import {
  commentListQuerySchema,
  commentListResponseApiSchema,
  commentResponseApiSchema,
  createCommentRequestSchema,
} from "./comment.dto";

describe("createCommentRequestSchema", () => {
  it("앞뒤 공백을 제거한 1자 코멘트를 허용한다", () => {
    const result = v.parse(createCommentRequestSchema, { content: " 한 " });

    expect(result).toEqual({ content: "한" });
  });

  it("200자 코멘트를 허용한다", () => {
    const content = "가".repeat(200);

    expect(v.parse(createCommentRequestSchema, { content })).toEqual({
      content,
    });
  });

  it("길이는 grapheme 단위로 센다 — 결합 이모지 200개는 허용, 201자는 거절", () => {
    const family = "👨‍👩‍👧‍👦";
    expect(
      v.safeParse(createCommentRequestSchema, { content: family.repeat(200) })
        .success,
    ).toBe(true);
    expect(
      v.safeParse(createCommentRequestSchema, { content: "가".repeat(201) })
        .success,
    ).toBe(false);
  });

  it("공백만 있는 코멘트를 거절한다", () => {
    const result = v.safeParse(createCommentRequestSchema, { content: " \n " });

    expect(result.success).toBe(false);
  });

  it("201자 코멘트를 거절한다", () => {
    const result = v.safeParse(createCommentRequestSchema, {
      content: "가".repeat(201),
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

it("코멘트 목록 Swagger 응답은 data 배열과 pagination을 같은 depth에 둔다", () => {
  expect(commentListResponseApiSchema).toMatchObject({
    required: ["data", "pagination"],
    properties: {
      data: { type: "array" },
      pagination: {
        type: "object",
        required: ["page", "pageSize", "hasNext"],
      },
    },
  });
});

it("코멘트 Swagger 응답은 nullable avatar를 명시한다", () => {
  expect(commentResponseApiSchema).toMatchObject({
    required: ["data"],
    properties: {
      data: {
        properties: {
          author: {
            properties: {
              avatar: {
                type: "object",
                nullable: true,
                required: ["color"],
              },
            },
          },
        },
      },
    },
  });
});
