import { randomInt } from "node:crypto";
import {
  INVITATION_CODE_CHARS,
  INVITATION_CODE_LENGTH,
} from "./invitation.constant";

// modulo는 문자 집합 크기가 2의 거듭제곱이 아니면 편향되므로 randomInt를 씁니다.
export function generateInvitationCode(): string {
  let code = "";

  for (let i = 0; i < INVITATION_CODE_LENGTH; i += 1) {
    code += INVITATION_CODE_CHARS[randomInt(INVITATION_CODE_CHARS.length)];
  }

  return code;
}
