import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
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
 */
@Catch()
export class LandingExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HonoHtmlResponse>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status);
    response.header("Content-Type", "text/html; charset=utf-8");
    response.header("Cache-Control", "no-store");
    response.res = response.body(renderLandingError(status));
  }
}
