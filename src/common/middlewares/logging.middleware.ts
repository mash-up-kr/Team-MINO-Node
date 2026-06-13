import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";

type LoggableRequest = { method: string; path: string };
// `res` is the Hono Context; `res.res` holds the final Response after next().
type LoggableResponse = { res?: { status?: number } };
type NextFn = () => Promise<void> | void;

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoggingMiddleware.name);

  async use(req: LoggableRequest, res: LoggableResponse, next: NextFn) {
    const startedAt = performance.now();

    try {
      await next();
    } finally {
      const durationMs = Math.round(performance.now() - startedAt);
      this.logger.log({
        method: req.method,
        path: req.path,
        status: res.res?.status ?? 200,
        durationMs,
      });
    }
  }
}
