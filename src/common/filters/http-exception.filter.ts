import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { AppException } from "../exceptions/app.exception";

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

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<any>();

    if (exception instanceof AppException) {
      this.sendJson(response, exception.getStatus(), {
        errorCode: exception.errorCode,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      this.sendJson(response, status, {
        errorCode: hasErrorCode(raw)
          ? raw.errorCode
          : (DEFAULT_ERROR_CODES[status] ?? "INTERNAL_SERVER_ERROR"),
        message: exception.message,
      });
      return;
    }

    if (exception instanceof Error) {
      this.logger.error(exception.stack);
    } else {
      this.logger.error(String(exception));
    }
    this.sendJson(response, HttpStatus.INTERNAL_SERVER_ERROR, {
      errorCode: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  }

  private sendJson(response: any, status: number, body: unknown): void {
    // Hono Context: ctx.status() sets internal status, ctx.json() uses it
    response.status(status);
    response.res = response.json(body);
  }
}
