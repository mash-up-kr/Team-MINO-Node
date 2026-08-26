import * as gcp from "@pulumi/gcp";
import { project } from "@/config";
import { enabledServices } from "@/resources/apis";

/**
 * Firebase Authentication. 회원가입 절차를 두지 않기 위해 익명 인증만 켜고,
 * 서버는 ID 토큰의 uid로 요청 유저를 식별한다(users.auth_uid).
 *
 * Firebase 프로젝트 자체는 hosting.ts가 만든다. 이 리소스는 콘솔에서 이미
 * 초기화된 config를 import한 것이라, 손대지 않는 필드도 실제 값을 그대로
 * 적어 둔다(생략하면 다음 up에서 지우려 든다).
 */
export const authConfig = new gcp.identityplatform.Config(
  "auth",
  {
    project,
    signIn: {
      anonymous: { enabled: true },
      email: { enabled: false },
      phoneNumber: { enabled: false },
    },
    // Firebase Hosting 기본 도메인. 인증 리다이렉트 허용 목록이다.
    authorizedDomains: [
      "team-mino-prod.firebaseapp.com",
      "team-mino-prod.web.app",
    ],
    mfa: { state: "DISABLED" },
    /*
     * 켜지면 일정 기간(30일) 앱을 열지 않은 익명 계정이 삭제된다. 우리 유저는
     * 곧 익명 계정이라 그대로 계정 소실이 되므로 명시적으로 꺼둔다.
     */
    autodeleteAnonymousUsers: false,
  },
  { dependsOn: enabledServices },
);
