import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import type { Env } from "../../config/env.schema";

interface CloudTasksRequest {
  headers: Record<string, string | undefined>;
}

/**
 * Cloud Run 서비스 전체가 allUsers에 공개돼있어(공개 API 라우트와 같은 서비스),
 * IAM만으로는 /internal/* 을 막을 수 없다. 대신 Cloud Tasks가 붙여 보내는
 * OIDC 토큰(Authorization: Bearer ...)을 여기서 직접 검증해 접근을 제어한다.
 *
 * audience는 요청 URL을 재구성하는 대신 고정 문자열(CLOUD_TASKS_OIDC_AUDIENCE)을 쓴다.
 * 태스크 생성 시 oidcToken.audience에도 동일한 값을 넣어야 한다.
 */
@Injectable()
export class CloudTasksGuard implements CanActivate {
  private readonly logger = new Logger(CloudTasksGuard.name);
  private readonly client = new OAuth2Client();

  constructor(private readonly configService: ConfigService<Env>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isLocalWorkerBypassEnabled()) return true;

    const request = context.switchToHttp().getRequest<CloudTasksRequest>();
    const authHeader = request.headers.authorization;
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : undefined;

    if (!idToken) {
      throw new UnauthorizedException("Missing Cloud Tasks OIDC token");
    }

    const expectedEmail = this.configService.getOrThrow(
      "CLOUD_TASKS_INVOKER_EMAIL",
      { infer: true },
    );
    const audience = this.configService.getOrThrow(
      "CLOUD_TASKS_OIDC_AUDIENCE",
      { infer: true },
    );

    const payload = await this.verify(idToken, audience);

    if (
      !payload?.email ||
      !payload.email_verified ||
      payload.email !== expectedEmail
    ) {
      throw new UnauthorizedException("Unexpected Cloud Tasks token subject");
    }

    return true;
  }

  private isLocalWorkerBypassEnabled(): boolean {
    return (
      this.configService.get("APP_ENV", { infer: true }) === "local" &&
      this.configService.get("CLOUD_TASKS_MODE", { infer: true }) === "local" &&
      this.configService.get("NODE_ENV", { infer: true }) !== "production"
    );
  }

  private async verify(idToken: string, audience: string) {
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      return ticket.getPayload();
    } catch (error) {
      this.logger.warn({ err: error }, "Cloud Tasks OIDC verification failed");
      throw new UnauthorizedException("Invalid Cloud Tasks OIDC token");
    }
  }
}
