import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { map } from "rxjs";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((data) => {
        if (data === undefined) return data;
        if (
          typeof data === "object" &&
          data !== null &&
          "data" in data &&
          "pagination" in data
        ) {
          return data;
        }
        return { data };
      }),
    );
  }
}
