#!/usr/bin/env bun

import * as Sentry from "@sentry/bun";
import { runSentryVerification } from "./verify-sentry-runner";

runSentryVerification(process.env, {
  captureException: (exception) => Sentry.captureException(exception),
  flush: (timeout) => Sentry.flush(timeout),
  init: (options) => Sentry.init(options),
  withScope: (callback) => Sentry.withScope(callback),
}).then((exitCode) => {
  process.exitCode = exitCode;
});
