import { describe, expect, it } from "bun:test";
import {
  INVITATION_CODE_CHARS,
  INVITATION_CODE_PATTERN,
} from "./invitation.constant";
import { generateInvitationCode } from "./invitation.util";

describe("generateInvitationCode", () => {
  it("생성한 코드는 자기 검증 패턴을 통과한다", () => {
    // when
    const codes = Array.from({ length: 1_000 }, generateInvitationCode);

    // then
    for (const code of codes) {
      expect(code).toMatch(INVITATION_CODE_PATTERN);
    }
  });

  it("문자 집합은 영숫자만 담는다", () => {
    // then
    // 패턴을 문자 집합으로 문자 클래스를 만들어 파생시키므로,
    // `-`·`]`·`^` 같은 문자가 들어오면 패턴 자체가 깨진다.
    expect(INVITATION_CODE_CHARS).toMatch(/^[A-Za-z0-9]+$/);
  });
});
