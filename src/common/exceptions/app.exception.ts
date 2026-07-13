import { HttpException, HttpStatus } from "@nestjs/common";

export interface AppExceptionOptions {
  /**
   * 백그라운드 재시도(Cloud Tasks 등)가 의미 있는 실패인지 명시한다.
   * 미지정 시 소비처가 HTTP status(5xx=재시도)로 추정한다. HTTP status가
   * 재시도 가능성과 어긋나는 경우(예: 비결정적 AI 응답의 422)만 지정하면 된다.
   */
  retryable?: boolean;
}

export class AppException extends HttpException {
  readonly retryable?: boolean;

  constructor(
    readonly errorCode: string,
    message: string,
    status: HttpStatus,
    options?: AppExceptionOptions,
  ) {
    super({ errorCode, message }, status);
    this.retryable = options?.retryable;
  }
}
