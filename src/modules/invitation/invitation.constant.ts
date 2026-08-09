export const INVITATION_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const INVITATION_CODE_LENGTH = 6;

// 문자 집합이 영숫자를 벗어나면(`-`, `]`, `^` 등) 문자 클래스가 깨집니다.
export const INVITATION_CODE_PATTERN = new RegExp(
  `^[${INVITATION_CODE_CHARS}]{${INVITATION_CODE_LENGTH}}$`,
);

// 인증 없이 열리는 응답이라 방 전체 멤버를 내려주지 않습니다.
export const PREVIEW_MEMBER_LIMIT = 5;
