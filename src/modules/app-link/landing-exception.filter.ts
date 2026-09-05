import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { SentryErrorReporter } from "../../infrastructures/sentry/sentry-reporter";
import { AppLinkService } from "./app-link.service";
import { renderLandingError } from "./landing.template";

/** BunHonoAdapter가 컨텍스트에 심어 두는 Express 형태의 응답 헬퍼. */
interface HonoHtmlResponse {
  status(code: number): void;
  header(name: string, value: string): void;
  body(content: string): unknown;
  res: unknown;
}

/**
 * 랜딩 라우트 전용 예외 필터.
 *
 * 전역 HttpExceptionFilter는 JSON을 내보낸다. 랜딩은 사람이 브라우저로 여는
 * 화면이라, 오타·삭제된 방·개인방 코드처럼 흔한 경우에 오류 JSON이 그대로
 * 보이면 안 된다. 상태 코드는 그대로 두고 본문만 HTML로 바꾼다.
 *
 * `.well-known` 라우트에는 붙이지 않는다. 그쪽은 OS가 읽는 파일이라 JSON이 맞다.
 *
 * 이 필터는 전역 HttpExceptionFilter를 대체하므로 그쪽의 Sentry 보고도 함께 잃는다.
 * 5xx 보고를 여기서 직접 한다. 기준은 전역 필터와 같다 — 4xx는 보고하지 않는다.
 */
@Catch()
export class LandingExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly reporter: SentryErrorReporter,
    private readonly appLinkService: AppLinkService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HonoHtmlResponse>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.report(exception, status);
    }

    response.status(status);
    response.header("Content-Type", "text/html; charset=utf-8");
    response.header("Cache-Control", "no-store");
    response.res = response.body(
      renderLandingError(status, this.appLinkService.storeLinks()),
    );
  }

  private report(exception: unknown, status: number): void {
    this.reporter.report(
      exception instanceof Error ? exception : new Error(String(exception)),
      { errorCode: "LANDING_RENDER_FAILED", httpStatusCode: status },
    );
  }
}
