import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module";
import { SentryModule } from "../sentry/sentry.module";
import { MessagingService } from "./messaging.service";

@Module({
  imports: [FirebaseModule, SentryModule],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
