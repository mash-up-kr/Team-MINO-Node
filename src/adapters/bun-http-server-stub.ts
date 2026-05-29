import { EventEmitter } from "node:events";
import type { Server as BunServer } from "bun";

// Stub for Bun.serve(), rqeuired for NestJS
export class BunHttpServerStub extends EventEmitter {
  constructor(
    private readonly getServer: () => BunServer<unknown> | undefined,
  ) {
    super();
  }

  address() {
    const server = this.getServer();
    return server
      ? { port: server.port, address: "0.0.0.0", family: "IPv4" }
      : null;
  }

  close(cb?: (err?: Error) => void) {
    void this.getServer()?.stop();
    cb?.();
    return this;
  }
}
