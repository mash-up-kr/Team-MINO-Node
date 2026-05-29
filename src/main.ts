import { NestFactory } from '@nestjs/core';
import { BunHonoAdapter } from './adapters/bun-hono.adapter';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new BunHonoAdapter());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT) || 3000);
}
bootstrap();
