import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { AppException } from "../exceptions/app.exception";

export type ErrorReportContext = {
  readonly errorCode: string;
  /** HTTP 응답에서 비롯된 에러만 채운다. 서비스 내부 리포트는 대응하는 상태가 없다. */
  readonly httpStatusCode?: number;
  /** 그룹핑을 깨지 않도록 가변 정보는 메시지 대신 여기에 싣는다. */
  readonly extra?: Record<string, unknown>;
};

export interface ErrorReporter {
  report(exception: Error, context: ErrorReportContext): void;
}

interface HonoResponse {
  status(code: number): void;
  json(body: unknown): unknown;
  res: unknown;
}

const DEFAULT_ERROR_CODES: Partial<Record<number, string>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
  500: "INTERNAL_SERVER_ERROR",
};

function hasErrorCode(v: unknown): v is { errorCode: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    "errorCode" in v &&
    typeof (v as Record<string, unknown>).errorCode === "string"
  );
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly reporter: ErrorReporter) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<HonoResponse>();

    if (exception instanceof AppException) {
      this.reportServerFailure(
        exception,
        exception.getStatus(),
        exception.errorCode,
      );
      this.sendJson(response, exception.getStatus(), {
        errorCode: exception.errorCode,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const errorCode = hasErrorCode(raw)
        ? raw.errorCode
        : (DEFAULT_ERROR_CODES[status] ?? "INTERNAL_SERVER_ERROR");
      this.reportServerFailure(exception, status, errorCode);
      this.sendJson(response, status, {
        errorCode,
        message: exception.message,
      });
      return;
    }

    const error =
      exception instanceof Error ? exception : new Error("Non-Error exception");
    if (exception instanceof Error) {
      this.logger.error(error.stack);
    } else {
      this.logger.error(String(exception));
    }
    this.reporter.report(error, {
      errorCode: "INTERNAL_SERVER_ERROR",
      httpStatusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    this.sendJson(response, HttpStatus.INTERNAL_SERVER_ERROR, {
      errorCode: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  }

  private reportServerFailure(
    exception: Error,
    status: number,
    errorCode: string,
  ): void {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.reporter.report(exception, { errorCode, httpStatusCode: status });
    }
  }

  private sendJson(
    response: HonoResponse,
    status: number,
    body: unknown,
  ): void {
    // Hono Context: ctx.status() sets internal status, ctx.json() uses it
    response.status(status);
    response.res = response.json(body);
  }
}
