import { Inject, Injectable, Logger } from "@nestjs/common";
import type { App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { FIREBASE_APP } from "../firebase/firebase.constant";
import { SentryErrorReporter } from "../sentry/sentry-reporter";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly messaging: Messaging;

  constructor(
    @Inject(FIREBASE_APP) app: App,
    private readonly reporter: SentryErrorReporter,
  ) {
    this.messaging = getMessaging(app);
  }

  async sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
    if (tokens.length === 0) return;

    try {
      const result = await this.messaging.sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
        android: { priority: "high" },
        apns: {
          headers: { "apns-priority": "10" },
          payload: { aps: { sound: "default" } },
        },
      });

      for (const response of result.responses) {
        if (response.success) continue;
        this.logger.warn({ code: response.error?.code }, "FCM send failed");
      }
    } catch (error) {
      this.logger.warn({ err: error }, "FCM send threw");
      this.reporter.report(new Error("FCM 발송 실패"), {
        errorCode: "FCM_SEND_FAILED",
        extra: { cause: String(error) },
      });
    }
  }
}
