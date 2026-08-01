import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { BunHonoAdapter } from "./adapters/bun-hono.adapter";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import type { Env } from "./config/env.schema";
import { SentryErrorReporter } from "./infrastructures/sentry/sentry-reporter";
import { WorkerAppModule } from "./worker-app.module";

export async function bootstrap(): Promise<void> {
  const adapter = new BunHonoAdapter();
  const rootModule =
    process.env.SERVICE_ROLE === "worker" ? WorkerAppModule : AppModule;
  const app = await NestFactory.create(rootModule, adapter, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService<Env>);
  const logger = app.get(Logger);
  const errorReporter = app.get(SentryErrorReporter);
  app.useLogger(logger);
  app.useGlobalFilters(new HttpExceptionFilter(errorReporter));
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableShutdownHooks();

  if (configService.getOrThrow("NODE_ENV", { infer: true }) !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Team MINO API")
      .setDescription("Team MINO backend API documentation")
      .setVersion("1.0.0")
      .build();

    SwaggerModule.setup("api-docs", app, () =>
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  await app.listen(configService.getOrThrow("PORT", { infer: true }));
}
