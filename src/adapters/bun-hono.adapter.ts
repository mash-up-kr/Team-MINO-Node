import type { Server as BunServer } from "bun";
import type { Context } from "hono";
import type { NestApplicationOptions } from "@nestjs/common";
import { HonoAdapter } from "@kiyasov/platform-hono/adapters";
import { BunHttpServerStub } from "./bun-http-server-stub";

interface BunHonoAdapterContext {
  extractClientIp(ctx: Context): string;
  parseRequestBody(
    ctx: Context,
    contentType?: string,
    rawBody?: boolean,
  ): Promise<void>;
}

// Use HTTP server stub for NestJS lifecycle
export class BunHonoAdapter extends HonoAdapter {
  private bunServer?: BunServer<unknown>;

  override initHttpServer(options: NestApplicationOptions): void {
    const self = this as unknown as BunHonoAdapterContext;

    this.instance.use(async (ctx, next) => {
      Object.assign(ctx.req, {
        ip: self.extractClientIp(ctx),
        query: ctx.req.query(),
        headers: Object.fromEntries(ctx.req.raw.headers),
      });
      await self.parseRequestBody(
        ctx,
        ctx.req.header("content-type"),
        options.rawBody,
      );
      await next();
    });

    this.httpServer = new BunHttpServerStub(() => this.bunServer) as never;
  }

  override listen(
    port: string | number,
    ...args: unknown[]
  ): ReturnType<HonoAdapter["listen"]> {
    const hostname =
      args.find((a): a is string => typeof a === "string") ?? "0.0.0.0";
    const callback = args.find((a): a is () => void => typeof a === "function");

    this.bunServer = Bun.serve({
      port: Number(port) || 3000,
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
