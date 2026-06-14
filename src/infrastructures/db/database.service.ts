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
      // 이 환경의 스키마만 바라보게 고정. 실수로 다른 환경 테이블을 건드리지 않도록.
      connection: { search_path: schema },
      // TLS는 연결 문자열로 제어합니다(로컬은 미지정, Supabase는 ?sslmode=require).
      // 연결은 Direct connection(또는 session pooler)을 사용합니다. 트랜잭션 풀러(6543)가
      // 아니므로 prepared statement 기본 동작(prepare: true)을 유지합니다.
    });
    this.db = drizzle(this.client, { casing: "snake_case" });
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
