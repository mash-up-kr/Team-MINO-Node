import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { App } from "firebase-admin/app";
import { type Auth, getAuth } from "firebase-admin/auth";
import { AppException } from "../../common/exceptions/app.exception";
import { FIREBASE_APP } from "../firebase/firebase.constant";
import type { VerifiedToken } from "./auth.type";
import { TokenVerifier } from "./token-verifier";

/** 만료 토큰에 Admin SDK가 붙이는 코드. 클라이언트가 갱신 후 재시도하면 해소된다. */
const ID_TOKEN_EXPIRED_CODE = "auth/id-token-expired";

/**
 * Firebase Authentication ID 토큰 검증.
 *
 * Admin SDK가 서명 공개키를 캐싱해 로컬에서 검증하므로 요청마다 Firebase를
 * 호출하지 않는다. 폐기 여부 확인(checkRevoked)은 매 요청 왕복을 유발하는데,
 * 익명 계정을 강제 로그아웃시키는 시나리오가 없어 켜지 않는다.
 */
@Injectable()
export class FirebaseTokenVerifier extends TokenVerifier {
  private readonly auth: Auth;

  constructor(@Inject(FIREBASE_APP) app: App) {
    super();
    this.auth = getAuth(app);
  }

  async verify(token: string): Promise<VerifiedToken> {
    try {
      const { uid } = await this.auth.verifyIdToken(token);
      return { uid };
    } catch (error) {
      if ((error as { code?: string }).code === ID_TOKEN_EXPIRED_CODE) {
        throw new AppException(
          "TOKEN_EXPIRED",
          "토큰이 만료되었습니다.",
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw new AppException(
        "UNAUTHORIZED",
        "유효하지 않은 토큰입니다.",
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
