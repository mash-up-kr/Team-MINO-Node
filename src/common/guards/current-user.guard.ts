import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { DatabaseService } from "../../infrastructures/db/database.service";
import { type UserAvatar, users } from "../../modules/user/user.schema";
import { AppException } from "../exceptions/app.exception";
import { readRequestHeader } from "./request-header";

/** 요청 유저. 가드가 식별해 요청 객체에 부착한다. */
export type RequestUser = {
  id: string;
  deviceId: string;
  nickname: string;
  avatar: UserAvatar | null;
};

export type RequestWithUser = {
  user?: RequestUser;
};

/** 임시 식별 헤더. 인증 설계 확정 시 이 계약은 사라진다. */
export const DEVICE_ID_HEADER = "x-device-id";

/**
 * TBD — 인증/인가 정책이 미정이라 실질적인 가드 정의를 보류한 자리표시자.
 *
 * 정책 확정 전까지는 `X-Device-Id` 헤더의 deviceId로 활성 유저를 조회해
 * 요청에 부착하는 **임시 식별**만 수행한다. 로그인·토큰 발급·검증·권한
 * 체계가 아니며, 인증 설계가 확정되면 이 가드를 실제 구현으로 교체한다.
 */
@Injectable()
export class CurrentUserGuard implements CanActivate {
  constructor(private readonly databaseService: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const deviceId = readRequestHeader(request, DEVICE_ID_HEADER)?.trim();
    if (!deviceId) {
      throw new AppException(
        "UNIDENTIFIED_USER",
        "요청 유저를 식별할 수 없습니다.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    const [user] = await this.databaseService.db
      .select({
        id: users.id,
        deviceId: users.deviceId,
        nickname: users.nickname,
        avatar: users.avatar,
      })
      .from(users)
      .where(and(eq(users.deviceId, deviceId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      throw new AppException(
        "UNIDENTIFIED_USER",
        "요청 유저를 식별할 수 없습니다.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    request.user = user;
    return true;
  }
}
