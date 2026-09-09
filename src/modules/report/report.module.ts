import { Module } from "@nestjs/common";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { AuthModule } from "../../infrastructures/auth/auth.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { ReportController } from "./report.controller";
import { ReportRepository } from "./report.repository";
import { ReportService } from "./report.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ReportController],
  providers: [ReportRepository, ReportService, CurrentUserGuard],
})
export class ReportModule {}
