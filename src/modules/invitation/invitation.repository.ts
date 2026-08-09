import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../infrastructures/db/database.service";

@Injectable()
export class InvitationRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }
}
