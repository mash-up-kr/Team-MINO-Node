import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type App, getApps, initializeApp } from "firebase-admin/app";
import type { Env } from "../../config/env.schema";
import { FIREBASE_APP } from "./firebase.constant";

/**
 * Firebase Admin App. ID 토큰 검증과 이후 FCM 발송이 같은 앱을 공유한다.
 *
 * Cloud Run에서는 런타임 서비스 계정의 ADC로 자격증명이 해결되므로 키 파일을
 * 다루지 않는다.
 */
@Module({
  providers: [
    {
      provide: FIREBASE_APP,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env>): App => {
        // Firebase 프로젝트는 GCP 프로젝트 위에 얹히므로, 따로 지정하지 않으면 같은 값을 쓴다.
        const projectId =
          configService.get("FIREBASE_PROJECT_ID", { infer: true }) ??
          configService.getOrThrow("GOOGLE_CLOUD_PROJECT", { infer: true });

        // 같은 프로세스에서 두 번 초기화하면 예외가 나므로 이미 있으면 재사용한다.
        return getApps()[0] ?? initializeApp({ projectId });
      },
    },
  ],
  exports: [FIREBASE_APP],
})
export class FirebaseModule {}
