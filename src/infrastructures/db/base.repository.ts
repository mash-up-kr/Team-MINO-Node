import { Injectable } from "@nestjs/common";
import { DatabaseService } from "./database.service";

/**
 * 도메인 repository 공통 베이스. DatabaseService 주입과 db 접근자를 제공하며,
 * 각 repository는 이를 상속해 쿼리 정의에만 집중한다.
 */
@Injectable()
export abstract class BaseRepository {
  constructor(protected readonly databaseService: DatabaseService) {}

  protected get db() {
    return this.databaseService.db;
  }
}
