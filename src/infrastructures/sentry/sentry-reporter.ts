import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/bun";
import type {
  ErrorReportContext,
  ErrorReporter,
} from "../../common/filters/http-exception.filter";

@Injectable()
export class SentryErrorReporter implements ErrorReporter {
  report(exception: Error, context: ErrorReportContext): void {
    Sentry.withScope((scope) => {
      scope.setTag("error.code", context.errorCode);
      scope.setTag("http.status_code", context.httpStatusCode);
      Sentry.captureException(exception);
    });
  }
}
