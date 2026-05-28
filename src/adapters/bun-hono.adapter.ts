import type { Server as BunServer } from "bun";
import type { NestApplicationOptions } from "@nestjs/common";
import { HonoAdapter } from "@kiyasov/platform-hono/adapters";
import { BunHttpServerStub } from "./bun-http-server-stub";

// Use HTTP server stub for NestJS lifecycle
export class BunHonoAdapter extends HonoAdapter {
  private bunServer?: BunServer<unknown>;

  override initHttpServer(options: NestApplicationOptions): void {
    super.initHttpServer(options);
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
