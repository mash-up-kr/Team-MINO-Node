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
 * API Cloud Run 서비스는 공개 라우트가 있더라도 요청 경계에서 OIDC를
 * 직접 검증해 /internal/* 접근을 명시적으로 제한한다.
 *
 * audience는 API 서비스 URL을 사용한다. 태스크 생성 시 oidcToken.audience에도
 * 동일한 값을 넣어야 한다.
 */
@Injectable()
export class CloudTasksGuard implements CanActivate {
  private readonly logger = new Logger(CloudTasksGuard.name);
  private readonly client = new OAuth2Client();

  constructor(private readonly configService: ConfigService<Env>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isLocalBypassEnabled()) return true;

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
    const audience = this.configService
      .getOrThrow("APP_BASE_URL", { infer: true })
      .replace(/\/+$/, "");

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

  private isLocalBypassEnabled(): boolean {
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
