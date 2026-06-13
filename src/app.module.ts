import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TerminusModule } from "@nestjs/terminus";
import { LoggerModule } from "nestjs-pino";
import { LoggingMiddleware } from "./common/middlewares/logging.middleware";
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggingMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
