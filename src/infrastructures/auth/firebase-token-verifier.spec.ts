import { describe, expect, it } from "bun:test";
import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { FirebaseTokenVerifier } from "./firebase-token-verifier";

type VerifyIdToken = (token: string) => Promise<{ uid: string }>;

/**
 * getAuth()는 실제 App 객체를 요구하므로 생성자를 건너뛰고 Admin SDK 핸들만
 * 끼워 넣는다. 검증 대상은 SDK 결과를 우리 계약으로 옮기는 부분이다.
 */
function createVerifier(verifyIdToken: VerifyIdToken): FirebaseTokenVerifier {
  const verifier = Object.create(
    FirebaseTokenVerifier.prototype,
  ) as FirebaseTokenVerifier;
  (verifier as unknown as { auth: { verifyIdToken: VerifyIdToken } }).auth = {
    verifyIdToken,
  };
  return verifier;
}

function firebaseError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe("FirebaseTokenVerifier", () => {
  it("검증에 성공하면 uid를 돌려준다", async () => {
    const verifier = createVerifier(async () => ({ uid: "firebase-uid" }));

    await expect(verifier.verify("token")).resolves.toEqual({
      uid: "firebase-uid",
    });
  });

  it("만료 토큰은 TOKEN_EXPIRED로 구분한다", async () => {
    const verifier = createVerifier(async () => {
      throw firebaseError("auth/id-token-expired");
    });

    const promise = verifier.verify("expired");

    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "TOKEN_EXPIRED",
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it("그 밖의 검증 실패는 UNAUTHORIZED로 뭉뚱그린다", async () => {
    const verifier = createVerifier(async () => {
      throw firebaseError("auth/argument-error");
    });

    await expect(verifier.verify("broken")).rejects.toMatchObject({
      errorCode: "UNAUTHORIZED",
      status: HttpStatus.UNAUTHORIZED,
    });
  });
});
