import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../config/env.schema";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: ReturnType<typeof postgres>;
  readonly db: ReturnType<typeof drizzle>;

  constructor(configService: ConfigService<Env>) {
    const databaseUrl = configService.getOrThrow("DATABASE_URL", {
      infer: true,
    });
    const max = configService.get("DB_POOL_SIZE", 10, { infer: true });

    this.client = postgres(databaseUrl, {
      max,
    });
    this.db = drizzle(this.client);
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
