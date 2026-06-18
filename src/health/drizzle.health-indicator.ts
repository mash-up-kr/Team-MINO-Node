import { Injectable } from "@nestjs/common";
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from "@nestjs/terminus";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../infrastructures/db/database.service";

@Injectable()
export class DrizzleHealthIndicator {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.databaseService.db.execute(sql`SELECT 1`);
      return indicator.up();
    } catch {
      return indicator.down("Database ping failed");
    }
  }
}
