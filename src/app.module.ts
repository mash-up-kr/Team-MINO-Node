import { Module, RequestMethod } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TerminusModule } from "@nestjs/terminus";
import { LoggerModule } from "nestjs-pino";
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
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          transport:
            config.get("NODE_ENV") !== "production"
              ? { target: "pino-pretty", options: { singleLine: true } }
              : undefined,
          redact: ["req.headers.authorization"],
        },
        exclude: [{ method: RequestMethod.ALL, path: "*" }],
      }),
    }),
    DatabaseModule,
    TerminusModule,
  ],
  controllers: [HealthController],
  providers: [DrizzleHealthIndicator],
})
export class AppModule {}
