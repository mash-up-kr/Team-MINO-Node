import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { map } from "rxjs";
import { PaginatedResult } from "./paginated-result";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((data) => {
        if (data === undefined) return data;
        if (data instanceof PaginatedResult) {
          return { data: data.data, pagination: data.pagination };
        }
        return { data };
      }),
    );
  }
}
