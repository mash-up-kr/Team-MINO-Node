import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { TokenVerifier } from "../../infrastructures/auth/token-verifier";
import { AppException } from "../exceptions/app.exception";
import { readRequestHeader } from "./request-header";

export const AUTHORIZATION_HEADER = "authorization";
const BEARER_PREFIX = "Bearer ";

/** 토큰으로 확인한 인증 주체. 아직 우리 users 행과 연결되지 않았을 수 있다. */
export type RequestWithAuthUid = {
  authUid?: string;
};

/**
 * Authorization 헤더의 Bearer 토큰을 검증해 uid를 돌려준다.
 *
 * 유저 등록 전에도 쓰이므로 users 조회는 하지 않는다. 등록된 유저까지 필요한
 * 경우는 CurrentUserGuard가 이 결과로 조회를 이어간다.
 */
export async function resolveAuthUid(
  request: unknown,
  tokenVerifier: TokenVerifier,
): Promise<string> {
  const header = readRequestHeader(request, AUTHORIZATION_HEADER)?.trim();
  const token = header?.startsWith(BEARER_PREFIX)
    ? header.slice(BEARER_PREFIX.length).trim()
    : undefined;

  if (!token) {
    throw new AppException(
      "UNAUTHORIZED",
      "인증 정보가 없습니다.",
      HttpStatus.UNAUTHORIZED,
    );
  }

  const { uid } = await tokenVerifier.verify(token);
  return uid;
}

/**
 * 토큰만 검증하고 등록된 유저는 요구하지 않는다.
 * 아직 users 행이 없는 시점의 엔드포인트(유저 등록)에 쓴다.
 */
@Injectable()
export class AuthUidGuard implements CanActivate {
  constructor(private readonly tokenVerifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthUid>();

    request.authUid = await resolveAuthUid(request, this.tokenVerifier);
    return true;
  }
}
