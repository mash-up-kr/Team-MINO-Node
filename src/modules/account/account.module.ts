import { Module } from "@nestjs/common";
import { AuthUidGuard } from "../../common/guards/auth-uid.guard";
import { CurrentUserGuard } from "../../common/guards/current-user.guard";
import { AuthModule } from "../../infrastructures/auth/auth.module";
import { DatabaseModule } from "../../infrastructures/db/database.module";
import { AccountController } from "./account.controller";
import { AuthController } from "./auth.controller";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AuthController, AccountController],
  providers: [AuthUidGuard, CurrentUserGuard],
})
export class AccountModule {}
