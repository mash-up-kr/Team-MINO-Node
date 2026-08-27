import { describe, expect, it } from "bun:test";
import type { ExecutionContext } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
import type { TokenVerifier } from "../../infrastructures/auth/token-verifier";
import type { DatabaseService } from "../../infrastructures/db/database.service";
import { AppException } from "../exceptions/app.exception";
import type { RequestWithUser } from "./current-user.guard";
import { CurrentUserGuard } from "./current-user.guard";

const REGISTERED_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  nickname: "지은",
  avatar: { color: "red" },
};

function createContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createVerifier(uid = "firebase-uid"): TokenVerifier {
  return { verify: async () => ({ uid }) } as TokenVerifier;
}

/** drizzle 쿼리 빌더는 체이닝 후 await 되므로 limit에서 결과를 돌려준다. */
function createDatabaseService(rows: unknown[]): DatabaseService {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => rows,
  };
  return { db: chain } as unknown as DatabaseService;
}

describe("CurrentUserGuard", () => {
  it("토큰의 uid로 찾은 유저를 요청에 부착한다", async () => {
    const guard = new CurrentUserGuard(
      createVerifier("uid-1"),
      createDatabaseService([REGISTERED_USER]),
    );
    const context = createContext({ authorization: "Bearer token" });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    expect(request.user).toEqual(REGISTERED_USER);
    expect(request.authUid).toBe("uid-1");
  });

  it("토큰은 유효하나 등록 전이면 401 USER_NOT_REGISTERED", async () => {
    const guard = new CurrentUserGuard(
      createVerifier(),
      createDatabaseService([]),
    );

    const promise = guard.canActivate(
      createContext({ authorization: "Bearer token" }),
    );

    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "USER_NOT_REGISTERED",
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it("인증 정보가 없으면 유저를 조회하지 않고 401", async () => {
    let queried = false;
    const database = createDatabaseService([REGISTERED_USER]);
    const originalSelect = database.db.select;
    database.db.select = ((...args: unknown[]) => {
      queried = true;
      return (originalSelect as (...a: unknown[]) => unknown).apply(
        database.db,
        args,
      );
    }) as typeof database.db.select;

    const guard = new CurrentUserGuard(createVerifier(), database);

    await expect(guard.canActivate(createContext({}))).rejects.toMatchObject({
      errorCode: "UNAUTHORIZED",
    });
    expect(queried).toBe(false);
  });
});
