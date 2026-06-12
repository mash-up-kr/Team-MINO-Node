import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { BunHonoAdapter } from "./adapters/bun-hono.adapter";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import type { Env } from "./config/env.schema";

async function bootstrap() {
  const adapter = new BunHonoAdapter();
  const app = await NestFactory.create(AppModule, adapter, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService<Env>);
  const logger = app.get(Logger);
  app.useLogger(logger);
  adapter.useRequestLogger(({ method, path, status, durationMs }) => {
    logger.log(`${method} ${path} ${status} ${durationMs}ms`);
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Team MINO API")
    .setDescription("Team MINO backend API documentation")
    .setVersion("1.0.0")
    .build();

  SwaggerModule.setup("api-docs", app, () =>
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  await app.listen(configService.getOrThrow("PORT", { infer: true }));
}
bootstrap();
