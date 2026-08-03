import { HttpException, HttpStatus } from "@nestjs/common";

export interface AppExceptionOptions {
  /**
   * Internal worker가 백그라운드 재시도(Cloud Tasks 등)를 할지 명시한다.
   * Cloud Tasks는 이 값을 직접 읽지 않으며, worker가 HTTP 응답 상태로 변환한다.
   * 미지정 시 5xx는 재시도하고 4xx는 acknowledge한다. HTTP status와
   * 재시도 가능성이 어긋나는 경우(예: 비결정적 AI 응답의 422)에만 지정한다.
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
