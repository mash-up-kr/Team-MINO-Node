import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/bun";
import { GoogleAuth } from "google-auth-library";
import type { Env } from "../../config/env.schema";
import type { PushPayload } from "./messaging.type";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const SEND_TIMEOUT_MS = 5_000;

/**
 * FCM v1 발송. 실패는 여기서 삼키고 Sentry로만 보고한다 — 호출부(알림 생성)가
 * 발송 실패로 실패해서는 안 된다.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly auth = new GoogleAuth({ scopes: [FCM_SCOPE] });
  private readonly projectId: string;

  constructor(configService: ConfigService<Env>) {
    this.projectId = configService.getOrThrow("GOOGLE_CLOUD_PROJECT", {
      infer: true,
    });
  }

  async sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
    await Promise.allSettled(
      tokens.map((token) => this.sendOne(token, payload)),
    );
  }

  private async sendOne(token: string, payload: PushPayload): Promise<void> {
    try {
      const client = await this.auth.getClient();
      const { token: accessToken } = await client.getAccessToken();
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: payload.title, body: payload.body },
              data: payload.data,
              apns: {
                headers: { "apns-priority": "10" },
                payload: { aps: { sound: "default" } },
              },
            },
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        this.logger.warn({ status: res.status }, "FCM send failed");
      }
    } catch (error) {
      this.logger.warn({ err: error }, "FCM send threw");
      Sentry.captureException(error);
    }
  }
}
