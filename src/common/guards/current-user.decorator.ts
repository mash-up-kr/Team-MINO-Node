import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { RequestUser, RequestWithUser } from "./current-user.guard";

/** CurrentUserGuard가 부착한 요청 유저를 꺼낸다. 가드와 함께 사용해야 한다. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const { currentUser } = context
      .switchToHttp()
      .getRequest<RequestWithUser>();

    if (!currentUser) {
      throw new Error(
        "CurrentUser는 CurrentUserGuard가 적용된 핸들러에서만 사용할 수 있습니다.",
      );
    }
    return currentUser;
  },
);
