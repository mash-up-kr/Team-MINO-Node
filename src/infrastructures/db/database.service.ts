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
      // max_lifetime은 기본값(커넥션마다 30~60분 랜덤)을 그대로 둔다. 끊기는 쪽은
      // 유휴 커넥션이라 위 정리만으로 충분하고, 고정값을 주면 커넥션들이 같은 시각에
      // 만료돼 재연결이 몰린다.

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
