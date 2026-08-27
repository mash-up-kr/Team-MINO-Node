import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import { graphemeLength, maxGraphemes } from "./grapheme";

describe("graphemeLength", () => {
  it("한글·영문은 글자 수 그대로 센다", () => {
    expect(graphemeLength("꾹이네 방")).toBe(5);
  });

  it("결합 이모지를 1자로 센다 (UTF-16 코드유닛과 다름)", () => {
    const family = "👨‍👩‍👧‍👦";
    expect(family.length).toBeGreaterThan(1);
    expect(graphemeLength(family)).toBe(1);
  });
});

describe("maxGraphemes", () => {
  const schema = v.pipe(v.string(), maxGraphemes(3, "3자 이하"));

  it("grapheme 기준으로 상한을 판정한다", () => {
    expect(v.safeParse(schema, "🇰🇷🍕👍").success).toBe(true);
    expect(v.safeParse(schema, "가나다라").success).toBe(false);
  });
});
