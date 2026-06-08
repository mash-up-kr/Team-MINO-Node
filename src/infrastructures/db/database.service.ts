import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../../config/env.schema";
import { resolveDbSchema } from "./db.env";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: ReturnType<typeof postgres>;
  readonly db: ReturnType<typeof drizzle>;

  constructor(configService: ConfigService<Env>) {
    const databaseUrl = configService.getOrThrow("DATABASE_URL", {
      infer: true,
    });
    const max = configService.get("DB_POOL_SIZE", 5, { infer: true });
    const schema = resolveDbSchema(
      configService.get("DATABASE_SCHEMA", { infer: true }),
    );

    this.client = postgres(databaseUrl, {
      max,
      // Supabase 6543 트랜잭션 풀러는 prepared statement를 지원하지 않으므로 끔.
      // (로컬 postgres에서도 동작에 문제 없음)
      prepare: false,
      // 이 환경의 스키마만 바라보게 고정. 실수로 다른 환경 테이블을 건드리지 않도록.
      connection: { search_path: schema },
      // TLS는 연결 문자열로 제어합니다(로컬은 미지정, Supabase는 ?sslmode=require).
    });
    this.db = drizzle(this.client, { casing: "snake_case" });
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
