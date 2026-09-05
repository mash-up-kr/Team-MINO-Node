import type { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { TestingModuleBuilder } from "@nestjs/testing";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { ResponseInterceptor } from "../src/common/interceptors/response.interceptor";
import {
  STATIC_ASSETS_CACHE_CONTROL,
  STATIC_ASSETS_ROOT,
} from "../src/config/static-assets";
import { SentryErrorReporter } from "../src/infrastructures/sentry/sentry-reporter";

export async function startApp(
  builder: TestingModuleBuilder,
): Promise<{ app: INestApplication; baseUrl: string }> {
  const moduleRef = await builder.compile();
  const adapter = new BunHonoAdapter();
  const app = moduleRef.createNestApplication(adapter, {
    bufferLogs: true,
    logger: false,
  });

  app.useGlobalFilters(new HttpExceptionFilter(app.get(SentryErrorReporter)));
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
  adapter.useStaticAssets(STATIC_ASSETS_ROOT, {
    onFound: (_path, ctx) => {
      ctx.header("Cache-Control", STATIC_ASSETS_CACHE_CONTROL);
    },
  });
  await app.listen(0);
  const { port } = app.getHttpServer().address() as { port: number };
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}
