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
      if (context.httpStatusCode !== undefined) {
        scope.setTag("http.status_code", context.httpStatusCode);
      }
      if (context.extra) {
        scope.setExtras(context.extra);
      }
      Sentry.captureException(exception);
    });
  }
}
