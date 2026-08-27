import { describe, expect, it } from "bun:test";
import type { ExecutionContext } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
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
