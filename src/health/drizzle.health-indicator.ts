import { Injectable, Logger } from "@nestjs/common";
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from "@nestjs/terminus";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../infrastructures/db/database.service";

@Injectable()
export class DrizzleHealthIndicator {
  private readonly logger = new Logger(DrizzleHealthIndicator.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.databaseService.db.execute(sql`SELECT 1`);
      return indicator.up();
    } catch (error) {
      this.logger.error({ err: error }, "DB ping 실패");
      return indicator.down("Database ping failed");
    }
  }
}
