export const INVITATION_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const INVITATION_CODE_LENGTH = 6;

// 문자 집합이 영숫자를 벗어나면(`-`, `]`, `^` 등) 문자 클래스가 깨집니다.
export const INVITATION_CODE_PATTERN = new RegExp(
  `^[${INVITATION_CODE_CHARS}]{${INVITATION_CODE_LENGTH}}$`,
);
