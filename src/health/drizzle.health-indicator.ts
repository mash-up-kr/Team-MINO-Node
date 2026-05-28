import { Injectable } from "@nestjs/common";
import {
	HealthCheckError,
	HealthIndicator,
	type HealthIndicatorResult,
} from "@nestjs/terminus";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class DrizzleHealthIndicator extends HealthIndicator {
	constructor(private readonly databaseService: DatabaseService) {
		super();
	}

	async pingCheck(key: string): Promise<HealthIndicatorResult> {
		try {
			await this.databaseService.db.execute(sql`SELECT 1`);
			return this.getStatus(key, true);
		} catch (error) {
			throw new HealthCheckError(
				"Database ping failed",
				this.getStatus(key, false),
			);
		}
	}
}
