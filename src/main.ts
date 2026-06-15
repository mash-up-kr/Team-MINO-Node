import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { BunHonoAdapter } from "./adapters/bun-hono.adapter";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import type { Env } from "./config/env.schema";
import { loadSecretEnv } from "./config/secret-env";

async function bootstrap() {
  // env 검증 전에 Secret Manager에서 env를 가져와 process.env를 채웁니다.
  // AppModule은 import 시점에 ConfigModule.forRoot가 validateEnv를 실행하므로,
  // 반드시 loadSecretEnv() 이후에 동적 import 해야 합니다(정적 import면 검증이 먼저 돔).
  await loadSecretEnv();
  const { AppModule } = await import("./app.module");

  const adapter = new BunHonoAdapter();
  const app = await NestFactory.create(AppModule, adapter, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService<Env>);
  const logger = app.get(Logger);
  app.useLogger(logger);
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
