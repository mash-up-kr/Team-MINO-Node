import {
  Body,
  Controller,
  Delete,
  NotImplementedException,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthUid } from "../../common/decorators/auth-uid.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireAuthUid } from "../../common/decorators/require-auth-uid.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import type { RequestUser } from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  errorApiSchema,
  IDENTITY_PROVIDERS,
  type IdentityProvider,
  identityResponseApiSchema,
  okResponseApiSchema,
  providerParamSchema,
  type SocialCredential,
  socialCredentialApiExamples,
  socialCredentialApiSchema,
  socialCredentialSchema,
} from "./account.dto";

// 계약 리뷰용 뼈대다. 핸들러는 아직 구현하지 않았다.
@ApiTags("user")
@Controller("api/v1/users/me")
export class AccountController {
  @Post("identities")
  @RequireCurrentUser()
  @ApiOperation({
    summary: "로그인 수단 추가",
    description:
      "현재 계정에 소셜 계정을 연결한다. 계정이 바뀌거나 토큰이 다시 발급되지는 않는다. " +
      "제공자마다 하나씩, 최대 세 개까지 연결할 수 있다.",
  })
  @ApiBody({
    schema: socialCredentialApiSchema,
    examples: socialCredentialApiExamples,
  })
  @ApiResponse({
    status: 201,
    description: "추가된 로그인 수단",
    schema: identityResponseApiSchema,
  })
  @ApiResponse({
    status: 400,
    description: "요청 형식 오류 (VALIDATION_ERROR)",
    schema: errorApiSchema("VALIDATION_ERROR"),
  })
  @ApiResponse({
    status: 409,
    description:
      "다른 계정에 연결된 소셜 계정 (IDENTITY_ALREADY_LINKED) 또는 " +
      "같은 제공자를 이미 연결함 (PROVIDER_ALREADY_LINKED)",
    schema: errorApiSchema(
      "IDENTITY_ALREADY_LINKED",
      "PROVIDER_ALREADY_LINKED",
    ),
  })
  @ApiResponse({
    status: 503,
    description: "소셜 제공자 일시 장애 (PROVIDER_UNAVAILABLE)",
    schema: errorApiSchema("PROVIDER_UNAVAILABLE"),
  })
  linkIdentity(
    @CurrentUser() _user: RequestUser,
    @Body(new ValibotPipe(socialCredentialSchema)) _body: SocialCredential,
  ): never {
    throw new NotImplementedException();
  }

  @Delete("identities/:provider")
  @RequireCurrentUser()
  @ApiOperation({
    summary: "로그인 수단 해제",
    description:
      "지정한 제공자의 연결을 해제한다. 마지막 로그인 수단은 해제할 수 없다. " +
      "Apple 연결을 해제하면 서버가 보관한 Apple 토큰도 폐기한다.",
  })
  @ApiParam({ name: "provider", enum: IDENTITY_PROVIDERS })
  @ApiResponse({ status: 200, schema: okResponseApiSchema })
  @ApiResponse({
    status: 400,
    description: "지원하지 않는 provider (VALIDATION_ERROR)",
    schema: errorApiSchema("VALIDATION_ERROR"),
  })
  @ApiResponse({
    status: 404,
    description: "연결한 적 없는 제공자 (IDENTITY_NOT_FOUND)",
    schema: errorApiSchema("IDENTITY_NOT_FOUND"),
  })
  @ApiResponse({
    status: 409,
    description: "남은 로그인 수단이 하나뿐 (LAST_IDENTITY)",
    schema: errorApiSchema("LAST_IDENTITY"),
  })
  unlinkIdentity(
    @CurrentUser() _user: RequestUser,
    @Param("provider", new ValibotPipe(providerParamSchema))
    _provider: IdentityProvider,
  ): never {
    throw new NotImplementedException();
  }

  @Delete()
  // 프로필을 만들기 전 계정도 탈퇴할 수 있도록 토큰만 검증한다.
  @RequireAuthUid()
  @ApiOperation({
    summary: "회원 탈퇴",
    description:
      "계정을 탈퇴 처리하고, 모든 기기의 세션과 푸시 등록, 소셜 연결을 해제한다. " +
      "방장으로 있는 공동방은 가장 먼저 들어온 멤버에게 넘기고, 혼자 남은 방은 삭제한다. " +
      "같은 소셜 계정으로 다시 로그인하면 새 계정이 된다.",
  })
  @ApiResponse({ status: 200, schema: okResponseApiSchema })
  withdraw(@AuthUid() _authUid: string): never {
    throw new NotImplementedException();
  }
}
