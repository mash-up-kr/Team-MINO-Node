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
import { DbKeepAliveService } from "./health/db-keep-alive.service";
import { DrizzleHealthIndicator } from "./health/drizzle.health-indicator";
import { HealthController } from "./health/health.controller";
import { DatabaseModule } from "./infrastructures/db/database.module";
import { SentryModule } from "./infrastructures/sentry/sentry.module";
import { CommentModule } from "./modules/comment/comment.module";
import { InvitationModule } from "./modules/invitation/invitation.module";
import { PlaceModule } from "./modules/place/place.module";

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
    SentryModule,
    CommentModule,
    PlaceModule,
    InvitationModule,
  ],
  controllers: [HealthController],
  providers: [DrizzleHealthIndicator, DbKeepAliveService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggingMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
