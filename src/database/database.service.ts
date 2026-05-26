import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: ReturnType<typeof postgres>;
  readonly db: ReturnType<typeof drizzle>;

  constructor(configService: ConfigService) {
    const databaseUrl = configService.getOrThrow<string>("DATABASE_URL");
    const max = Number(configService.get<string>("DB_POOL_SIZE", "10"));

    this.client = postgres(databaseUrl, {
      max,
    });
    this.db = drizzle(this.client);
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
