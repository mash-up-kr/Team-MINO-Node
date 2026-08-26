import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { RequestWithAuthUid } from "../guards/auth-uid.guard";

/** 가드가 토큰에서 확인한 uid를 꺼낸다. RequireAuthUid()와 함께 사용해야 한다. */
export const AuthUid = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { authUid } = context.switchToHttp().getRequest<RequestWithAuthUid>();

    if (!authUid) {
      throw new Error(
        "AuthUid는 RequireAuthUid()가 적용된 핸들러에서만 사용할 수 있습니다.",
      );
    }
    return authUid;
  },
);
