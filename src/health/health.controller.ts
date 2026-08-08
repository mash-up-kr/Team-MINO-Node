import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { DbKeepAliveService } from "./db-keep-alive.service";
import { DrizzleHealthIndicator } from "./drizzle.health-indicator";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly drizzle: DrizzleHealthIndicator,
    private readonly dbKeepAlive: DbKeepAliveService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.drizzle.pingCheck("database")]);
  }

  @Get("keep-alive")
  async keepAlive() {
    const ok = await this.dbKeepAlive.ping();
    if (!ok) {
      throw new ServiceUnavailableException("Database keep-alive failed");
    }
    return { status: "ok" };
  }
}
