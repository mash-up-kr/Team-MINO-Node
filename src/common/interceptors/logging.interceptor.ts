import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";
import { tap } from "rxjs";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const req = http.getRequest<{ method: string; path: string }>();
    const startedAt = performance.now();

    const log = (status: number) => {
      const durationMs = Math.round(performance.now() - startedAt);
      this.logger.log({
        method: req.method,
        path: req.path,
        status,
        durationMs,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => log(http.getResponse()?.res?.status ?? 200),
        error: (err: unknown) =>
          log(
            typeof err === "object" && err !== null && "status" in err
              ? (err as { status: number }).status
              : 500,
          ),
      }),
    );
  }
}
