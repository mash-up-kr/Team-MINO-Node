import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import {
  nicknameSchema,
  registerUserRequestSchema,
  updateProfileRequestSchema,
} from "./user.dto";

describe("nicknameSchema", () => {
  it.each([
    "꾹이",
    "GgukLover",
    "꾹 러버",
    "ab",
    "가".repeat(15),
  ])("유효한 닉네임을 통과시킨다: %s", (nickname) => {
    expect(v.safeParse(nicknameSchema, nickname).success).toBe(true);
  });

  it.each([
    "가",
    "가".repeat(16),
    "꾹이!",
    "gguk_1",
    "꾹이2",
    "😀꾹",
  ])("정책 위반 닉네임을 거절한다: %s", (nickname) => {
    expect(v.safeParse(nicknameSchema, nickname).success).toBe(false);
  });

  it("앞뒤 공백은 잘라낸 뒤 검증한다", () => {
    const result = v.safeParse(nicknameSchema, "  꾹이  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.output).toBe("꾹이");
  });
});

describe("registerUserRequestSchema", () => {
  it("avatar가 없으면 거절한다 (최초 진입 시 필수 입력)", () => {
    const result = v.safeParse(registerUserRequestSchema, {
      nickname: "꾹이",
    });
    expect(result.success).toBe(false);
  });

  it("avatar id는 음수를 거절한다", () => {
    const result = v.safeParse(registerUserRequestSchema, {
      nickname: "꾹이",
      avatar: { id: -1 },
    });
    expect(result.success).toBe(false);
  });
});

describe("updateProfileRequestSchema", () => {
  it("수정 필드가 하나도 없으면 거절한다", () => {
    expect(v.safeParse(updateProfileRequestSchema, {}).success).toBe(false);
  });

  it("nickname 또는 avatar 한 필드만으로 수정할 수 있다", () => {
    expect(
      v.safeParse(updateProfileRequestSchema, { avatar: { id: 3 } }).success,
    ).toBe(true);
    expect(
      v.safeParse(updateProfileRequestSchema, { nickname: "새이름" }).success,
    ).toBe(true);
  });
});
