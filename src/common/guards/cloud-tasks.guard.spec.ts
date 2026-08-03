import { describe, expect, it, jest } from "bun:test";
import type { ExecutionContext } from "@nestjs/common";
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { CloudTasksGuard } from "./cloud-tasks.guard";

const EXPECTED_EMAIL =
  "team-mino-prod-tasks-invoker@team-mino-prod.iam.gserviceaccount.com";
const AUDIENCE = "https://api.team-mino.example";

type GuardWithClient = {
  client: { verifyIdToken: (...args: unknown[]) => unknown };
};

function createConfigService(
  overrides: Record<string, string> = {},
): ConfigService {
  const env: Record<string, string> = {
    APP_ENV: "local",
    APP_BASE_URL: AUDIENCE,
    CLOUD_TASKS_INVOKER_EMAIL: EXPECTED_EMAIL,
    CLOUD_TASKS_MODE: "cloud",
    NODE_ENV: "development",
    ...overrides,
  };

  return {
    getOrThrow: (key: string) => {
      const value = env[key];
      if (value !== undefined) return value;
      throw new Error(`unexpected config key: ${key}`);
    },
    get: (key: string) => env[key],
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

  it("OIDC 토큰 검증 자체가 실패하면 일시 장애로 보고 503 (Cloud Tasks 재시도 허용)", async () => {
    const guard = new CloudTasksGuard(createConfigService());
    stubVerifyIdToken(guard, () => {
      throw new Error("invalid signature");
    });

    await expect(
      guard.canActivate(createContext({ authorization: "Bearer bad-token" })),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
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

  it("로컬 모드 + non-production에서는 Postman 직접 호출을 위해 OIDC 없이 통과한다", async () => {
    const guard = new CloudTasksGuard(
      createConfigService({ CLOUD_TASKS_MODE: "local" }),
    );
    const verifyIdToken = stubVerifyIdToken(guard, () => {
      throw new Error("should not verify");
    });

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("production에서는 로컬 모드 값이 들어와도 OIDC 검증을 우회하지 않는다", async () => {
    const guard = new CloudTasksGuard(
      createConfigService({
        APP_ENV: "prod",
        CLOUD_TASKS_MODE: "local",
        NODE_ENV: "production",
      }),
    );

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
