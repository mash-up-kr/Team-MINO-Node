import { Module } from "@nestjs/common";
import { InvitationModule } from "../invitation/invitation.module";
import { AppLinkConfig } from "./app-link.config";
import { AppLinkController } from "./app-link.controller";
import { AppLinkService } from "./app-link.service";

/**
 * 초대 링크의 웹 쪽 절반.
 *
 * 앱 저장소를 따로 두지 않고 이 서버에 붙인 이유:
 *   · 랜딩의 OG 태그를 코드별로 서버 렌더링해야 하는데, 그 데이터가
 *     InvitationService.preview() 그대로다. 분리하면 네트워크 홉이 하나 는다.
 *   · `.well-known` 두 개는 정적 JSON 응답이라 라우트 두 개면 끝난다.
 *   · Firebase Hosting + Cloud Run 배포 경로가 이미 있어서 apex 도메인만 얹으면 된다.
 */
@Module({
  imports: [InvitationModule],
  controllers: [AppLinkController],
  providers: [AppLinkConfig, AppLinkService],
})
export class AppLinkModule {}
