import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  UseFilters,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { RawResponse } from "../../common/decorators/raw-response.decorator";
import { AppException } from "../../common/exceptions/app.exception";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { invitationCodeParamSchema } from "../invitation/invitation.dto";
import {
  ANDROID_ASSET_LINKS,
  APPLE_APP_SITE_ASSOCIATION,
  WELL_KNOWN_PREFIX,
} from "./app-link.constant";
import { AppLinkService } from "./app-link.service";
import { renderLanding } from "./landing.template";
import { LandingExceptionFilter } from "./landing-exception.filter";

/**
 * 앱 링크용 공개 라우트. 앱이 아니라 OS와 브라우저가 호출한다.
 *
 * 인증이 없다. `.well-known`은 OS가 앱 설치 시점에 익명으로 가져가고,
 * 랜딩은 앱을 아직 깔지 않은 사람이 여는 페이지다.
 *
 * Swagger에서는 감춘다. 앱 클라이언트가 호출할 API가 아니다.
 */
@ApiExcludeController()
@Controller()
export class AppLinkController {
  constructor(private readonly appLinkService: AppLinkService) {}

  /**
   * iOS가 앱 설치 시점에 가져가는 파일.
   *
   * 확장자 없이 이 경로 그대로여야 하고, Content-Type이 application/json이어야 하며,
   * 리다이렉트 없이 200으로 응답해야 한다. 셋 중 하나만 어긋나도 iOS가 무시한다.
   *
   * 애플은 CDN(app-site-association.cdn-apple.com)을 통해 캐싱하므로 수정이
   * 즉시 반영되지 않는다. 앱팀과 함께 확인할 때 그 주소를 같이 본다.
   */
  @Get(`${WELL_KNOWN_PREFIX}/${APPLE_APP_SITE_ASSOCIATION}`)
  @RawResponse()
  @Header("Content-Type", "application/json")
  @Header("Cache-Control", "public, max-age=3600")
  appleAppSiteAssociation(): unknown {
    const payload = this.appLinkService.appleAppSiteAssociation();
    if (!payload) throw this.notConfigured("iOS");

    return payload;
  }

  /** Android가 앱 설치 시점에 가져가는 파일. */
  @Get(`${WELL_KNOWN_PREFIX}/${ANDROID_ASSET_LINKS}`)
  @RawResponse()
  @Header("Content-Type", "application/json")
  @Header("Cache-Control", "public, max-age=3600")
  assetLinks(): unknown {
    const payload = this.appLinkService.assetLinks();
    if (!payload) throw this.notConfigured("Android");

    return payload;
  }

  /**
   * 초대 랜딩. 앱이 열리지 않은 모든 경우가 여기로 온다.
   *
   * 인앱 브라우저(카카오톡·인스타그램)는 앱이 설치돼 있어도 링크를 가로채지
   * 않으므로, 설치 유도와 "앱에서 열기"를 함께 노출한다.
   */
  @Get("r/:code")
  // 오류도 사람이 보는 화면이므로 JSON 대신 HTML로 응답한다.
  @UseFilters(LandingExceptionFilter)
  @RawResponse()
  @Header("Content-Type", "text/html; charset=utf-8")
  // 공유 카드 크롤러가 오래된 방 이름을 붙들지 않도록 짧게 잡는다.
  @Header("Cache-Control", "public, max-age=60")
  async landing(
    @Param("code", new ValibotPipe(invitationCodeParamSchema)) code: string,
  ): Promise<string> {
    const view = await this.appLinkService.landing(code);

    return renderLanding(view, this.appLinkService.inviteUrl(code));
  }

  /** 식별자를 아직 받지 못한 플랫폼. 도메인이 앱을 인정하지 않는 상태와 같다. */
  private notConfigured(platform: string): AppException {
    return new AppException(
      "APP_LINK_NOT_CONFIGURED",
      `${platform} 앱 식별자가 설정되지 않았습니다.`,
      HttpStatus.NOT_FOUND,
    );
  }
}
