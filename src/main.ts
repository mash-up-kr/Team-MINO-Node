import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  const configService = app.get(ConfigService);
  const port = Number(configService.get("PORT", "3000"));
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Team MINO API")
    .setDescription("Team MINO backend API documentation")
    .setVersion("1.0.0")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup("api-docs", app, document);

  await app.listen(port);
}
bootstrap();
