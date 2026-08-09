import { Module } from "@nestjs/common";
import { SentryLifecycleService } from "./sentry-lifecycle.service";
import { SentryErrorReporter } from "./sentry-reporter";

@Module({
  providers: [SentryErrorReporter, SentryLifecycleService],
  exports: [SentryErrorReporter],
})
export class SentryModule {}
