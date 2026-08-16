import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema";

const REQUEST_TIMEOUT_MS = 10_000;

/*
 * DB 제공자가 유휴 프로젝트를 pause하는 것을 막는다. 활동 집계는 제공자 API 게이트웨이를
 * 지나는 요청 기준이라, 앱이 쓰는 Direct connection은 아무리 쿼리를 날려도 잡히지 않는다.
 * 호출 대상과 키는 env로 주입해 제공자를 바꿔도 코드가 그대로이도록 한다.
 */
@Injectable()
export class DbKeepAliveService {
  private readonly logger = new Logger(DbKeepAliveService.name);

  constructor(private readonly configService: ConfigService<Env>) {}

  async ping(): Promise<boolean> {
    const url = this.configService.get("SUPABASE_KEEP_ALIVE_URL", {
      infer: true,
    });
    const apiKey = this.configService.get("SUPABASE_API_KEY", { infer: true });
    if (!url || !apiKey) {
      this.logger.warn("DB keep-alive 설정이 없어 건너뜁니다");
      return false;
    }

    try {
      const response = await fetch(url, {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.error(
          { status: response.status },
          "DB keep-alive 응답 실패",
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error({ err: error }, "DB keep-alive 요청 실패");
      return false;
    }
  }
}
