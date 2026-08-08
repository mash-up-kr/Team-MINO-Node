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
        // 페이지네이션처럼 data 형제 필드가 필요한 응답은 핸들러가 직접 감싼다
        if (data !== null && typeof data === "object" && "data" in data) {
          return data;
        }
        return { data };
      }),
    );
  }
}
