import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { SchemaObject } from "../../common/swagger/schema";

export const IDENTITY_PROVIDERS = ["google", "apple", "kakao"] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

const idTokenSchema = v.pipe(
  v.string(),
  v.minLength(1, "idToken이 필요합니다."),
);

/**
 * 소셜 제공자가 발급한 OIDC ID 토큰. access token이나 앱이 꺼낸 사용자 ID는 받지 않는다.
 * 서버가 서명, iss, aud, exp를 검증한 뒤 sub로만 소셜 계정을 식별한다.
 */
export const socialCredentialSchema = v.variant("provider", [
  v.object({ provider: v.literal("google"), idToken: idTokenSchema }),
  v.object({ provider: v.literal("kakao"), idToken: idTokenSchema }),
  v.object({
    provider: v.literal("apple"),
    idToken: idTokenSchema,
    // 탈퇴하거나 연결을 해제할 때 Apple 토큰을 폐기하려면 서버가 이 코드를 교환해 둬야 한다.
    authorizationCode: v.pipe(
      v.string(),
      v.minLength(1, "authorizationCode가 필요합니다."),
    ),
  }),
]);
export type SocialCredential = v.InferOutput<typeof socialCredentialSchema>;

export const refreshRequestSchema = v.object({
  refreshToken: v.pipe(
    v.string(),
    v.minLength(1, "refreshToken이 필요합니다."),
  ),
});
export type RefreshRequest = v.InferOutput<typeof refreshRequestSchema>;

export const providerParamSchema = v.picklist(
  IDENTITY_PROVIDERS,
  "provider는 google, apple, kakao 중 하나여야 합니다.",
);

export const socialCredentialApiSchema = toJsonSchema(socialCredentialSchema, {
  errorMode: "ignore",
}) as SchemaObject;

export const refreshRequestApiSchema = toJsonSchema(refreshRequestSchema, {
  errorMode: "ignore",
}) as SchemaObject;

export const socialCredentialApiExamples = {
  google: { value: { provider: "google", idToken: "example.google.id" } },
  kakao: { value: { provider: "kakao", idToken: "example.kakao.id" } },
  apple: {
    value: {
      provider: "apple",
      idToken: "example.apple.id",
      authorizationCode: "example-apple-code",
    },
  },
};

const tokenPairSchema: SchemaObject = {
  type: "object",
  required: [
    "accessToken",
    "refreshToken",
    "accessExpiresAt",
    "refreshExpiresAt",
  ],
  properties: {
    accessToken: {
      type: "string",
      description:
        "꾹 서버가 서명한 JWT. sub는 users.auth_uid, sid는 현재 세션이다.",
      example: "example.gguk.access",
    },
    refreshToken: {
      type: "string",
      description: "불투명 토큰. 갱신할 때마다 교체되므로 받은 값을 저장한다.",
      example: "example-opaque-refresh",
    },
    accessExpiresAt: {
      type: "string",
      format: "date-time",
      description: "발급 후 30분",
      example: "2026-11-25T12:30:00Z",
    },
    refreshExpiresAt: {
      type: "string",
      format: "date-time",
      description: "발급 또는 마지막 갱신 후 90일",
      example: "2027-02-23T12:00:00Z",
    },
  },
};

export const tokenPairResponseApiSchema: SchemaObject = {
  type: "object",
  properties: { data: tokenPairSchema },
};

export const identityApiSchema: SchemaObject = {
  type: "object",
  required: ["provider", "linkedAt"],
  properties: {
    provider: {
      type: "string",
      enum: [...IDENTITY_PROVIDERS],
      example: "kakao",
    },
    linkedAt: {
      type: "string",
      format: "date-time",
      example: "2026-11-25T12:00:00Z",
    },
  },
};

export const identityResponseApiSchema: SchemaObject = {
  type: "object",
  properties: { data: identityApiSchema },
};

export const okResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: { ok: { type: "boolean", example: true } },
    },
  },
};

/** 토큰이 담긴 응답은 캐시되면 안 된다. */
export const noStoreApiHeaders: Record<
  string,
  { description: string; schema: SchemaObject }
> = {
  "Cache-Control": {
    description: "자격증명 응답 캐싱 금지",
    schema: { type: "string", enum: ["no-store"] },
  },
};

/** 엔드포인트별로 나올 수 있는 errorCode를 enum으로 좁혀 문서화한다. */
export function errorApiSchema(...errorCodes: string[]): SchemaObject {
  return {
    type: "object",
    properties: {
      errorCode: { type: "string", enum: errorCodes, example: errorCodes[0] },
      message: { type: "string" },
    },
  };
}
