import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { BunHonoAdapter } from "./adapters/bun-hono.adapter";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";

async function bootstrap() {
  const adapter = new BunHonoAdapter();
  const app = await NestFactory.create(AppModule, adapter, {
    bufferLogs: true,
  });
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
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  adapter.setupSwagger("/api-docs", document as Record<string, unknown>);

  await app.listen(Number(process.env.PORT) || 3000);
}
bootstrap();
