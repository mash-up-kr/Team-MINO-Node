import * as Sentry from "@sentry/bun";
import type { ErrorReporter } from "../../common/filters/http-exception.filter";

export const sentryErrorReporter: ErrorReporter = {
  report(exception, context): void {
    Sentry.withScope((scope) => {
      scope.setTag("error.code", context.errorCode);
      scope.setTag("http.status_code", context.httpStatusCode);
      Sentry.captureException(exception);
    });
  },
};
