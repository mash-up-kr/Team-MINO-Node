import type { INestApplication } from "@nestjs/common";
import type { TestingModuleBuilder } from "@nestjs/testing";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { ResponseInterceptor } from "../src/common/interceptors/response.interceptor";
import { SentryErrorReporter } from "../src/infrastructures/sentry/sentry-reporter";

export async function startApp(
  builder: TestingModuleBuilder,
): Promise<{ app: INestApplication; baseUrl: string }> {
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication(new BunHonoAdapter(), {
    bufferLogs: true,
    logger: false,
  });

  app.useGlobalFilters(new HttpExceptionFilter(app.get(SentryErrorReporter)));
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.listen(0);
  const { port } = app.getHttpServer().address() as { port: number };
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}
