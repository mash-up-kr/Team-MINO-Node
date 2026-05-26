import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

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

    const error =
      typeof exceptionResponse === "object" &&
      exceptionResponse !== null &&
      "error" in exceptionResponse
        ? (exceptionResponse as { error: string }).error
        : HttpStatus[status];

    response.status(status).json({
      statusCode: status,
      message,
      error,
      path: request.url,
    });
  }
}
