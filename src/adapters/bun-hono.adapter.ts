import type { ServeStaticOptions } from "@hono/node-server/serve-static";
import { HonoAdapter } from "@kiyasov/platform-hono/adapters";
import type { NestApplicationOptions } from "@nestjs/common";
import type { Server as BunServer } from "bun";
import { serveStatic } from "hono/bun";
import { BunHttpServerStub } from "./bun-http-server-stub";

// Use HTTP server stub for NestJS lifecycle
export class BunHonoAdapter extends HonoAdapter {
  private bunServer?: BunServer<unknown>;

  override initHttpServer(options: NestApplicationOptions): void {
    super.initHttpServer(options);
    this.httpServer = new BunHttpServerStub(() => this.bunServer) as never;

    // Inject Express-style `type`/`send` onto every Hono context
    this.instance.use(async (ctx, next) => {
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
    this.instance.get(`${prefix}/*`, serveStatic({ root, rewriteRequestPath }));
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
