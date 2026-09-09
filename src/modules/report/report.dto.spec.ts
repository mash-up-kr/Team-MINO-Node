import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import {
  createReportRequestSchema,
  REPORT_DETAIL_MAX_LENGTH,
} from "./report.dto";

const BASE = {
  targetType: "pin_comment",
  targetId: "123e4567-e89b-12d3-a456-426614174000",
  reason: "HARASSMENT",
} as const;

describe("createReportRequestSchema", () => {
  it("detail 없이도 접수된다", () => {
    expect(v.parse(createReportRequestSchema, { ...BASE })).toEqual({
      ...BASE,
    });
  });

  it(`${REPORT_DETAIL_MAX_LENGTH}자 detail을 허용한다`, () => {
    const detail = "가".repeat(REPORT_DETAIL_MAX_LENGTH);

    expect(v.parse(createReportRequestSchema, { ...BASE, detail })).toEqual({
      ...BASE,
      detail,
    });
  });

  it("길이는 grapheme 단위로 센다 — 결합 이모지는 1자로 셈", () => {
    const family = "👨‍👩‍👧‍👦";

    expect(
      v.safeParse(createReportRequestSchema, {
        ...BASE,
        detail: family.repeat(REPORT_DETAIL_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(createReportRequestSchema, {
        ...BASE,
        detail: "가".repeat(REPORT_DETAIL_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("공백만 있는 detail을 거절한다", () => {
    const result = v.safeParse(createReportRequestSchema, {
      ...BASE,
      detail: " \n ",
    });

    expect(result.success).toBe(false);
  });

  it("알 수 없는 reason을 거절한다", () => {
    const result = v.safeParse(createReportRequestSchema, {
      ...BASE,
      reason: "ANNOYING",
    });

    expect(result.success).toBe(false);
  });

  it("알 수 없는 targetType을 거절한다", () => {
    const result = v.safeParse(createReportRequestSchema, {
      ...BASE,
      targetType: "room",
    });

    expect(result.success).toBe(false);
  });

  it("uuid가 아닌 targetId를 거절한다", () => {
    const result = v.safeParse(createReportRequestSchema, {
      ...BASE,
      targetId: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });
});
