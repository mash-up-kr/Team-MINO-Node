import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import { REQUEST_ID_HEADER, RequestContext } from "../context/request-context";

type LoggableRequest = {
  method: string;
  path: string;
  header?: (name: string) => string | undefined;
  headers?: Record<string, string | string[] | undefined>;
};
// `res` is the Hono Context; `res.res` holds the final Response after next().
type LoggableResponse = {
  res?: { status?: number };
  header?: (name: string, value: string) => void;
  setHeader?: (name: string, value: string) => void;
};
type NextFn = () => Promise<void> | void;

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoggingMiddleware.name);

  async use(req: LoggableRequest, res: LoggableResponse, next: NextFn) {
    const { requestId } = RequestContext.extractOrCreate(req);

    if (typeof res.header === "function") {
      res.header(REQUEST_ID_HEADER, requestId);
    } else if (typeof res.setHeader === "function") {
      res.setHeader(REQUEST_ID_HEADER, requestId);
    }

    const startedAt = performance.now();

    await RequestContext.run({ requestId }, async () => {
      try {
        await next();
      } finally {
        const durationMs = Math.round(performance.now() - startedAt);
        const status = res.res?.status ?? 200;
        const logData = {
          requestId,
          method: req.method,
          path: req.path,
          status,
          durationMs,
        };

        if (status >= 500) {
          this.logger.error(logData);
        } else if (status >= 400) {
          this.logger.warn(logData);
        } else {
          this.logger.log(logData);
        }
      }
    });
  }
}
