import type { ServeStaticOptions } from "@hono/node-server/serve-static";
import { HonoAdapter } from "@kiyasov/platform-hono/adapters";
import { Logger, type NestApplicationOptions } from "@nestjs/common";
import type { Server as BunServer } from "bun";
import { serveStatic } from "hono/bun";
import { RequestContext } from "../common/context/request-context";
import { BunHttpServerStub } from "./bun-http-server-stub";

// Use HTTP server stub for NestJS lifecycle
export class BunHonoAdapter extends HonoAdapter {
  private bunServer?: BunServer<unknown>;
  private readonly logger = new Logger(BunHonoAdapter.name);

  override initHttpServer(options: NestApplicationOptions): void {
    // 라이브러리 미들웨어보다 먼저 등록해야 한다. Hono 라우터는 경로에 `*`가 있으면
    // 같은 미들웨어를 두 번 매칭하므로, 여기서 응답을 끝내 두 번째 실행을 막는다.
    this.instance.use(async (ctx, next) => {
      if (ctx.req.path.includes("*")) {
        const startedAt = performance.now();
        // 이 가드가 LoggingMiddleware보다 먼저 응답하므로, 요청 로그에 안 남는 404를 여기서 warn으로 남긴다.
        const { requestId } = RequestContext.extractOrCreate(ctx.req);
        this.logger.warn({
          requestId,
          method: ctx.req.method,
          path: ctx.req.path,
          status: 404,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return ctx.json({ errorCode: "NOT_FOUND", message: "Not Found" }, 404);
      }
      await next();
    });

    super.initHttpServer(options);
    this.httpServer = new BunHttpServerStub(() => this.bunServer) as never;

    // Inject Express-style `type`/`send` onto every Hono context
    this.instance.use(async (ctx, next) => {
      ctx.header("Cache-Control", "no-cache, no-store");
      Object.assign(ctx, {
        type: (value: string) => {
          ctx.header("Content-Type", value);
          return ctx;
        },
        send: (body: string) => {
          ctx.res = ctx.body(body);
          return ctx;
        },
      });
      await next();
    });
  }

  override useStaticAssets(root: string, options?: ServeStaticOptions): void {
    const prefix = (options as { prefix?: string } | undefined)?.prefix ?? "";
    const rewriteRequestPath = (path: string) => path.slice(prefix.length);
    this.instance.get(
      `${prefix}/*`,
      serveStatic({ root, rewriteRequestPath, onFound: options?.onFound }),
    );
  }

  override listen(
    port: string | number,
    ...args: unknown[]
  ): ReturnType<HonoAdapter["listen"]> {
    const hostname =
      args.find((a): a is string => typeof a === "string") ?? "0.0.0.0";
    const callback = args.find((a): a is () => void => typeof a === "function");
    const portNumber = typeof port === "number" ? port : Number(port);

    this.bunServer = Bun.serve({
      port: Number.isNaN(portNumber) ? 3000 : portNumber,
      hostname,
      fetch: this.instance.fetch,
    });

    const stub = this.httpServer as unknown as BunHttpServerStub;
    process.nextTick(() => stub.emit("listening"));
    callback?.();
    return stub as never;
  }

  override async close(): Promise<void> {
    await this.bunServer?.stop();
  }
}
