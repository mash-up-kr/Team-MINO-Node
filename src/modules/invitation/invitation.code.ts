import { randomInt } from "node:crypto";
import {
  INVITATION_CODE_ALPHABET,
  INVITATION_CODE_LENGTH,
} from "./invitation.constant";

// modulo는 알파벳 길이가 2의 거듭제곱이 아니면 편향되므로 randomInt를 씁니다.
export function generateInvitationCode(): string {
  let code = "";

  for (let i = 0; i < INVITATION_CODE_LENGTH; i += 1) {
    code +=
      INVITATION_CODE_ALPHABET[randomInt(INVITATION_CODE_ALPHABET.length)];
  }

  return code;
}
