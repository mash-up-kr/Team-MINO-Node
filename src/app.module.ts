import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TerminusModule } from "@nestjs/terminus";
import { validateEnv } from "./config/env.schema";
import { DatabaseModule } from "./database/database.module";
import { DrizzleHealthIndicator } from "./health/drizzle.health-indicator";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    TerminusModule,
  ],
  controllers: [HealthController],
  providers: [DrizzleHealthIndicator],
})
export class AppModule {}
