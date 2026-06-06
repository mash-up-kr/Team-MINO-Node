import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { BunHonoAdapter } from "./adapters/bun-hono.adapter";
import { AppModule } from "./app.module";

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
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT) || 3000);
}
bootstrap();
