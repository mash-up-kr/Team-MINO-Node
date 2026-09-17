import { afterEach, describe, expect, it, jest } from "bun:test";
import type { ExecutionContext } from "@nestjs/common";
import { HttpStatus, Logger } from "@nestjs/common";
import type { TokenVerifier } from "../../infrastructures/auth/token-verifier";
import { AppException } from "../exceptions/app.exception";
import { AuthUidGuard } from "./auth-uid.guard";

function createContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createVerifier(
  verify: TokenVerifier["verify"] = async (token) => ({ uid: `uid-${token}` }),
): TokenVerifier {
  return { verify } as TokenVerifier;
}

describe("AuthUidGuard", () => {
  it("Bearer 토큰을 검증해 uid를 요청에 부착한다", async () => {
    const guard = new AuthUidGuard(createVerifier());
    const context = createContext({ authorization: "Bearer token-1" });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const request = context.switchToHttp().getRequest<{ authUid?: string }>();
    expect(request.authUid).toBe("uid-token-1");
  });

  it("Authorization 헤더가 없으면 401 UNAUTHORIZED", async () => {
    const guard = new AuthUidGuard(createVerifier());

    const promise = guard.canActivate(createContext({}));

    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "UNAUTHORIZED",
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it("Bearer 스킴이 아니면 401 UNAUTHORIZED", async () => {
    const guard = new AuthUidGuard(createVerifier());

    const promise = guard.canActivate(
      createContext({ authorization: "Basic token-1" }),
    );

    await expect(promise).rejects.toMatchObject({
      errorCode: "UNAUTHORIZED",
    });
  });

  it("검증기가 만료를 알리면 그대로 전파한다", async () => {
    const guard = new AuthUidGuard(
      createVerifier(async () => {
        throw new AppException(
          "TOKEN_EXPIRED",
          "토큰이 만료되었습니다.",
          HttpStatus.UNAUTHORIZED,
        );
      }),
    );

    const promise = guard.canActivate(
      createContext({ authorization: "Bearer expired" }),
    );

    await expect(promise).rejects.toMatchObject({
      errorCode: "TOKEN_EXPIRED",
    });
  });
});

/*
 * 이 로그로 클라이언트가 토큰을 못 얻은 것인지 가진 토큰이 거절된 것인지 가린다.
 * 분류가 틀리면 원인을 엉뚱한 곳에서 찾게 되므로 값까지 확인한다.
 */
describe("AuthUidGuard 인증 실패 사유 로깅", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function captureWarnReason() {
    const reasons: unknown[] = [];
    jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation((entry: unknown) => {
        if (entry && typeof entry === "object" && "reason" in entry) {
          reasons.push((entry as { reason: unknown }).reason);
        }
      });
    return reasons;
  }

  it("헤더가 없으면 HEADER_MISSING", async () => {
    const reasons = captureWarnReason();
    const guard = new AuthUidGuard(createVerifier());

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      AppException,
    );

    expect(reasons).toEqual(["HEADER_MISSING"]);
  });

  it("Bearer 스킴이 아니면 NOT_BEARER", async () => {
    const reasons = captureWarnReason();
    const guard = new AuthUidGuard(createVerifier());

    await expect(
      guard.canActivate(createContext({ authorization: "Basic token-1" })),
    ).rejects.toBeInstanceOf(AppException);

    expect(reasons).toEqual(["NOT_BEARER"]);
  });

  it("검증기가 거절하면 그 errorCode를 그대로 남긴다", async () => {
    const reasons = captureWarnReason();
    const guard = new AuthUidGuard(
      createVerifier(async () => {
        throw new AppException(
          "TOKEN_EXPIRED",
          "토큰이 만료되었습니다.",
          HttpStatus.UNAUTHORIZED,
        );
      }),
    );

    await expect(
      guard.canActivate(createContext({ authorization: "Bearer expired" })),
    ).rejects.toBeInstanceOf(AppException);

    expect(reasons).toEqual(["TOKEN_EXPIRED"]);
  });

  it("AppException이 아닌 오류는 VERIFY_FAILED", async () => {
    const reasons = captureWarnReason();
    const guard = new AuthUidGuard(
      createVerifier(async () => {
        throw new Error("네트워크 끊김");
      }),
    );

    await expect(
      guard.canActivate(createContext({ authorization: "Bearer token-1" })),
    ).rejects.toThrow("네트워크 끊김");

    expect(reasons).toEqual(["VERIFY_FAILED"]);
  });

  it("인증에 성공하면 아무것도 남기지 않는다", async () => {
    const reasons = captureWarnReason();
    const guard = new AuthUidGuard(createVerifier());

    await expect(
      guard.canActivate(createContext({ authorization: "Bearer token-1" })),
    ).resolves.toBe(true);

    expect(reasons).toEqual([]);
  });
});
