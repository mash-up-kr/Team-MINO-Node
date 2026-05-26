import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";

const DEFAULT_ERROR_CODES: Partial<Record<number, string>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
  500: "INTERNAL_SERVER_ERROR",
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof exceptionResponse === "string"
        ? exceptionResponse
        : typeof exceptionResponse === "object" &&
            exceptionResponse !== null &&
            "message" in exceptionResponse
          ? (exceptionResponse as { message: string | string[] }).message
          : "Internal server error";

    const errorCode =
      typeof exceptionResponse === "object" &&
      exceptionResponse !== null &&
      "errorCode" in exceptionResponse
        ? (exceptionResponse as { errorCode: string }).errorCode
        : (DEFAULT_ERROR_CODES[status] ?? "INTERNAL_SERVER_ERROR");

    response.status(status).json({ errorCode, message });
  }
}
