import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { TokenVerifier } from "../../infrastructures/auth/token-verifier";
import { DatabaseService } from "../../infrastructures/db/database.service";
import { type UserAvatar, users } from "../../modules/user/user.schema";
import { AppException } from "../exceptions/app.exception";
import { type RequestWithAuthUid, resolveAuthUid } from "./auth-uid.guard";

/** 요청 유저. 가드가 식별해 요청 객체에 부착한다. */
export type RequestUser = {
  id: string;
  nickname: string;
  avatar: UserAvatar | null;
};

export type RequestWithUser = RequestWithAuthUid & {
  user?: RequestUser;
};

/**
 * Authorization Bearer 토큰(Firebase ID 토큰)을 검증하고, 그 uid로 등록된 활성
 * 유저를 조회해 요청에 부착한다.
 *
 * 토큰은 유효하지만 아직 등록 전이면 USER_NOT_REGISTERED로 구분해 응답한다 —
 * 클라이언트는 이 코드를 오류가 아니라 온보딩 진입 신호로 쓴다. 앱을 지웠다
 * 다시 깐 사용자가 여기로 떨어진다.
 */
@Injectable()
export class CurrentUserGuard implements CanActivate {
  constructor(
    private readonly tokenVerifier: TokenVerifier,
    private readonly databaseService: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authUid = await resolveAuthUid(request, this.tokenVerifier);

    const [user] = await this.databaseService.db
      .select({
        id: users.id,
        nickname: users.nickname,
        avatar: users.avatar,
      })
      .from(users)
      .where(and(eq(users.authUid, authUid), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      throw new AppException(
        "USER_NOT_REGISTERED",
        "등록되지 않은 유저입니다.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    request.authUid = authUid;
    request.user = user;
    return true;
  }
}
