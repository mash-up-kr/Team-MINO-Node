import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { map } from "rxjs";
import { RAW_RESPONSE_KEY } from "../decorators/raw-response.decorator";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    // @RawResponse()가 붙은 라우트는 응답 형태를 우리가 정할 수 없다.
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isRaw) return next.handle();

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
