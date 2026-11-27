import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { AuthUid } from "../../common/decorators/auth-uid.decorator";
import { RequireAuthUid } from "../../common/decorators/require-auth-uid.decorator";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  errorApiSchema,
  noStoreApiHeaders,
  okResponseApiSchema,
  type RefreshRequest,
  refreshRequestApiSchema,
  refreshRequestSchema,
  type SocialCredential,
  socialCredentialApiExamples,
  socialCredentialApiSchema,
  socialCredentialSchema,
  tokenPairResponseApiSchema,
} from "./account.dto";

// 계약 리뷰용 뼈대다. 핸들러는 아직 구현하지 않았다.
@ApiTags("auth")
@Controller("api/v1/auth")
export class AuthController {
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "소셜 로그인",
    description:
      "소셜 ID 토큰을 검증하고 꾹 토큰 쌍을 발급한다. 처음 보는 소셜 계정이면 계정을 새로 만든다. " +
      "응답에는 프로필 등록 여부가 없으므로, 앱은 이어서 GET /users/me를 호출하고 " +
      "401 USER_NOT_REGISTERED를 받으면 프로필 설정(POST /users)으로 보낸다.\n\n" +
      "앱을 업데이트한 뒤 처음 로그인할 때만, 기기에 남아 있는 Firebase ID 토큰을 Bearer로 함께 보낸다. " +
      "그 익명 계정에 로그인 수단이 없으면 소셜 계정을 연결해서, 저장한 장소와 공동방을 그대로 이어 쓴다. " +
      "소셜 계정이 이미 다른 꾹 계정에 연결돼 있으면 그 계정으로 로그인하고, 익명 계정의 기록은 가져오지 않는다. " +
      "로그인에 성공하면 앱은 Firebase에서 signOut한다.",
  })
  // 인증은 선택이다. Bearer 없이도 호출할 수 있다.
  @ApiBearerAuth()
  @ApiSecurity({})
  @ApiBody({
    schema: socialCredentialApiSchema,
    examples: socialCredentialApiExamples,
  })
  @ApiResponse({
    status: 200,
    description: "토큰 쌍. 신규 가입과 기존 계정 로그인 모두 같은 형태다.",
    schema: tokenPairResponseApiSchema,
    headers: noStoreApiHeaders,
  })
  @ApiResponse({
    status: 400,
    description: "요청 형식 오류 (VALIDATION_ERROR)",
    schema: errorApiSchema("VALIDATION_ERROR"),
  })
  @ApiResponse({
    status: 401,
    description:
      "소셜 토큰 검증 실패 (INVALID_SOCIAL_TOKEN) 또는 첨부한 Firebase 토큰이 " +
      "유효하지 않음 (UNAUTHORIZED / TOKEN_EXPIRED)",
    schema: errorApiSchema(
      "INVALID_SOCIAL_TOKEN",
      "UNAUTHORIZED",
      "TOKEN_EXPIRED",
    ),
  })
  @ApiResponse({
    status: 502,
    description: "소셜 제공자 일시 장애 (PROVIDER_UNAVAILABLE)",
    schema: errorApiSchema("PROVIDER_UNAVAILABLE"),
  })
  login(
    @Body(new ValibotPipe(socialCredentialSchema)) _body: SocialCredential,
  ): never {
    throw new NotImplementedException();
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "토큰 갱신",
    description:
      "access 토큰과 refresh 토큰을 함께 교체한다. 직전 refresh 토큰으로 60초 안에 다시 요청하면 " +
      "같은 토큰 쌍을 돌려준다. 응답을 받지 못했거나 본앱과 공유 익스텐션이 동시에 갱신하는 경우를 위한 것이다. " +
      "그보다 오래된 토큰을 다시 쓰면 세션을 폐기한다.",
  })
  @ApiBody({ schema: refreshRequestApiSchema })
  @ApiResponse({
    status: 200,
    description: "새 토큰 쌍",
    schema: tokenPairResponseApiSchema,
    headers: noStoreApiHeaders,
  })
  @ApiResponse({
    status: 400,
    description: "요청 형식 오류 (VALIDATION_ERROR)",
    schema: errorApiSchema("VALIDATION_ERROR"),
  })
  @ApiResponse({
    status: 401,
    description:
      "refresh 토큰이 만료됐거나 폐기됐거나 유효하지 않음 (INVALID_REFRESH_TOKEN). 다시 로그인해야 한다.",
    schema: errorApiSchema("INVALID_REFRESH_TOKEN"),
  })
  refresh(
    @Body(new ValibotPipe(refreshRequestSchema)) _body: RefreshRequest,
  ): never {
    throw new NotImplementedException();
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @RequireAuthUid()
  @ApiOperation({
    summary: "현재 기기 로그아웃",
    description:
      "access 토큰의 세션을 폐기하고 이 세션이 등록한 푸시 토큰을 해제한다. 요청 본문은 없다. " +
      "다른 기기의 세션은 유지된다.",
  })
  @ApiResponse({ status: 200, schema: okResponseApiSchema })
  logout(@AuthUid() _authUid: string): never {
    throw new NotImplementedException();
  }
}
