import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Response } from "express";
import { map } from "rxjs";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((data) => {
        const response = context.switchToHttp().getResponse<Response>();
        if (response.statusCode === 204) return;
        return { data };
      }),
    );
  }
}
