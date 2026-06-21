import * as Sentry from "@sentry/bun";

export type ErrorReportContext = {
  readonly errorCode: string;
  readonly httpStatusCode: number;
};

export interface ErrorReporter {
  report(exception: Error, context: ErrorReportContext): void;
}

export const sentryErrorReporter: ErrorReporter = {
  report(exception, context): void {
    Sentry.withScope((scope) => {
      scope.setTag("error.code", context.errorCode);
      scope.setTag("http.status_code", context.httpStatusCode);
      Sentry.captureException(exception);
    });
  },
};
