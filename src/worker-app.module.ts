import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { LoggingMiddleware } from "./common/middlewares/logging.middleware";
import { validateEnv } from "./config/env.schema";
import { DatabaseModule } from "./infrastructures/db/database.module";
import { SentryLifecycleService } from "./infrastructures/sentry/sentry-lifecycle.service";
import { SentryErrorReporter } from "./infrastructures/sentry/sentry-reporter";
import { PlaceWorkerModule } from "./modules/place/place-worker.module";

/** Cloud Tasks가 호출하는 worker 전용 애플리케이션. public API/health route는 포함하지 않는다. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          transport:
            process.env.NODE_ENV !== "production"
              ? { target: "pino-pretty", options: { singleLine: true } }
              : undefined,
          redact: ["req.headers.authorization"],
        },
        exclude: [{ method: RequestMethod.ALL, path: "*" }],
      }),
    }),
    DatabaseModule,
    PlaceWorkerModule,
  ],
  providers: [SentryErrorReporter, SentryLifecycleService],
})
export class WorkerAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggingMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
