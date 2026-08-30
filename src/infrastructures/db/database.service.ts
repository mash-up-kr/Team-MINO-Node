import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../../config/env.schema";
import { resolveDbSchema } from "./db.env";

/*
 * 유휴 커넥션을 우리 쪽에서 먼저 닫는다(초).
 *
 * postgres.js 기본값은 idle_timeout: null — 한 번 연 커넥션을 절대 놓지 않는다.
 * Cloud Run은 요청이 없으면 인스턴스 CPU를 조이므로 keep_alive조차 제때 못 나가고,
 * 그 사이 Supabase나 중간 경로가 먼저 연결을 끊는다. 앱은 그걸 모른 채 죽은 소켓을
 * 재사용해 `write CONNECTION_ENDED`로 실패한다(장소 추출처럼 간헐적인 작업일수록 잦다).
 * 상대가 끊기 전에 우리가 정리해서 죽은 커넥션을 잡을 확률을 낮춘다.
 */
const IDLE_TIMEOUT_SECONDS = 30;

/*
 * 커넥션 최대 수명(초). 기본값은 30~60분 랜덤이라 위 유휴 정리를 빠져나간
 * 커넥션이 오래 남는다. 짧게 잡아 주기적으로 새 커넥션으로 갈아탄다.
 */
const MAX_LIFETIME_SECONDS = 60 * 10;

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
      idle_timeout: IDLE_TIMEOUT_SECONDS,
      max_lifetime: MAX_LIFETIME_SECONDS,
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
