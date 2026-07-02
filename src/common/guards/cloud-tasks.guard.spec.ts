import { describe, expect, it, jest } from "bun:test";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { CloudTasksGuard } from "./cloud-tasks.guard";

const EXPECTED_EMAIL =
  "team-mino-prod-tasks-invoker@team-mino-prod.iam.gserviceaccount.com";
const AUDIENCE = "team-mino-place-extraction-worker";

type GuardWithClient = {
  client: { verifyIdToken: (...args: unknown[]) => unknown };
};

function createConfigService(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (key === "CLOUD_TASKS_INVOKER_EMAIL") return EXPECTED_EMAIL;
      if (key === "CLOUD_TASKS_OIDC_AUDIENCE") return AUDIENCE;
      throw new Error(`unexpected config key: ${key}`);
    },
  } as unknown as ConfigService;
}

function createContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function stubVerifyIdToken(
  guard: CloudTasksGuard,
  impl: (...args: unknown[]) => unknown,
) {
  const withClient = guard as unknown as GuardWithClient;
  withClient.client.verifyIdToken = jest.fn(impl);
  return withClient.client.verifyIdToken;
}

describe("CloudTasksGuard", () => {
  it("Authorization 헤더가 없으면 401", async () => {
    const guard = new CloudTasksGuard(createConfigService());

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("Bearer 스킴이 아니면 401", async () => {
    const guard = new CloudTasksGuard(createConfigService());

    await expect(
      guard.canActivate(createContext({ authorization: "Basic abc" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("OIDC 토큰 검증 자체가 실패하면 401", async () => {
    const guard = new CloudTasksGuard(createConfigService());
    stubVerifyIdToken(guard, () => {
      throw new Error("invalid signature");
    });

    await expect(
      guard.canActivate(createContext({ authorization: "Bearer bad-token" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("email이 기대하는 SA와 다르면 401", async () => {
    const guard = new CloudTasksGuard(createConfigService());
    stubVerifyIdToken(guard, () => ({
      getPayload: () => ({
        email: "someone-else@other.iam.gserviceaccount.com",
        email_verified: true,
      }),
    }));

    await expect(
      guard.canActivate(createContext({ authorization: "Bearer token" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("email_verified가 false면 401", async () => {
    const guard = new CloudTasksGuard(createConfigService());
    stubVerifyIdToken(guard, () => ({
      getPayload: () => ({ email: EXPECTED_EMAIL, email_verified: false }),
    }));

    await expect(
      guard.canActivate(createContext({ authorization: "Bearer token" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("email이 일치하고 검증되면 통과한다", async () => {
    const guard = new CloudTasksGuard(createConfigService());
    stubVerifyIdToken(guard, () => ({
      getPayload: () => ({ email: EXPECTED_EMAIL, email_verified: true }),
    }));

    await expect(
      guard.canActivate(createContext({ authorization: "Bearer token" })),
    ).resolves.toBe(true);
  });

  it("verifyIdToken에 요청 토큰과 설정된 audience를 그대로 전달한다", async () => {
    const guard = new CloudTasksGuard(createConfigService());
    const verifyIdToken = stubVerifyIdToken(guard, () => ({
      getPayload: () => ({ email: EXPECTED_EMAIL, email_verified: true }),
    }));

    await guard.canActivate(
      createContext({ authorization: "Bearer the-token" }),
    );

    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "the-token",
      audience: AUDIENCE,
    });
  });
});
