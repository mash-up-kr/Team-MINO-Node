import * as v from "valibot";

const envSchema = v.pipe(
  v.object({
    // Secret Manager 선택과 런타임 역할을 구분하는 배포 환경. Cloud Run은 prod, start:local은 local을 주입한다.
    APP_ENV: v.optional(v.picklist(["local", "prod"]), "local"),
    NODE_ENV: v.optional(
      v.picklist(["development", "test", "production"]),
      "development",
    ),
    PORT: v.optional(
      v.pipe(
        v.string(),
        v.regex(/^\d+$/),
        v.transform(Number),
        v.minValue(1),
        v.maxValue(65535),
      ),
      "3000",
    ),
    DATABASE_URL: v.pipe(v.string(), v.minLength(1), v.url()),
    // 접근할 스키마. 미설정 시 안전한 기본값 develop. 운영에서만 production 주입.
    DATABASE_SCHEMA: v.optional(
      v.picklist(["develop", "production"]),
      "develop",
    ),
    DB_POOL_SIZE: v.optional(
      v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(1)),
      "5",
    ),
    // GCP 프로젝트 ID(Vertex project 겸 Maps X-Goog-User-Project)
    GOOGLE_CLOUD_PROJECT: v.pipe(v.string(), v.minLength(1)),
    /*
     * Firebase Authentication 프로젝트 ID. ID 토큰의 iss/aud 검증 기준값이다.
     * Firebase 프로젝트는 GCP 프로젝트 위에 얹히므로, 미설정 시 GOOGLE_CLOUD_PROJECT를 쓴다.
     */
    FIREBASE_PROJECT_ID: v.optional(v.pipe(v.string(), v.minLength(1))),
    // Gemini 3.1 Flash-Lite 지원 location 중 이 앱의 기본값은 "global"이다.
    GOOGLE_VERTEX_LOCATION: v.optional(v.string(), "global"),
    /*
     * 인스타 이미지를 올려 gs://로 Vertex에 넘기는 버킷. 미지정 시 APP_ENV로 유도해
     * 로컬 실행이 운영 버킷에 쌓이지 않도록 한다.
     */
    GCS_PLACE_IMAGES_BUCKET: v.optional(v.pipe(v.string(), v.minLength(1))),
    KAKAO_REST_API_KEY: v.pipe(v.string(), v.minLength(1)),
    SENTRY_DSN: v.optional(v.pipe(v.string(), v.url(), v.regex(/^https:\/\//))),
    SENTRY_RELEASE: v.optional(v.pipe(v.string(), v.minLength(1))),
    /*
     * DB keep-alive용. 제공자가 유휴 프로젝트를 pause하지 않도록 API 게이트웨이를 주기적으로
     * 찌른다. 미설정 시 keep-alive만 비활성화되고 서버는 그대로 뜬다.
     */
    SUPABASE_KEEP_ALIVE_URL: v.optional(
      v.pipe(v.string(), v.url(), v.startsWith("https://")),
    ),
    SUPABASE_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
    /*
     * 인스타 로그아웃 GraphQL의 persisted query id. 인스타가 주기적으로 교체하므로
     * 재배포 없이 갱신할 수 있도록 env에 둔다. 낡으면 게시글 HTML 경로로 자동 폴백한다.
     */
    INSTAGRAM_DOC_ID: v.pipe(v.string(), v.minLength(1)),
    // Cloud Tasks가 워커(/internal/*) 호출 시 쓰는 SA 이메일. OIDC 토큰의 email 클레임과 대조.
    CLOUD_TASKS_INVOKER_EMAIL: v.pipe(v.string(), v.minLength(1)),
    /*
     * API가 Cloud Tasks에 넣을 대상 서비스 URL. OIDC 토큰은 API의
     * /internal/* 엔드포인트에서 검증한다.
     */
    APP_BASE_URL: v.pipe(v.string(), v.minLength(1), v.url()),
    // infra/src/resources/tasks.ts의 placeExtractionQueue와 값을 맞춰야 한다.
    CLOUD_TASKS_LOCATION: v.pipe(v.string(), v.minLength(1)),
    CLOUD_TASKS_QUEUE: v.pipe(v.string(), v.minLength(1)),
    // 큐의 maxAttempts와 같아야 한다(infra/Pulumi.prod.yaml).
    CLOUD_TASKS_MAX_ATTEMPTS: v.optional(
      v.pipe(v.unknown(), v.transform(Number), v.number(), v.minValue(1)),
      10,
    ),
    /*
     * cloud: 실제 Cloud Tasks enqueue + OIDC guard.
     * local: `bun run start:local` 전용. enqueue는 no-op이고 워커 guard는 non-production에서만 우회한다.
     */
    CLOUD_TASKS_MODE: v.optional(v.picklist(["cloud", "local"]), "cloud"),

    /*
     * ── 초대 링크(유니버설 링크 / App Links) ─────────────────────────────
     *
     * 아래 값들은 전부 앱팀에서 받아야 한다. 저장소에는 원래 하나도 없었고,
     * 도메인이 "이 앱을 인정한다"고 증명하는 데 쓰인다.
     *
     * 값이 비어 있으면 해당 플랫폼의 `.well-known`이 404가 된다.
     * 앱 부팅은 막지 않는다 — 아직 인정하지 않는 상태가 곧 맞는 표현이라서다.
     */

    // 초대 링크가 올라가는 오리진. api.gguk.org가 아니라 apex(gguk.org)다.
    APP_WEB_ORIGIN: v.optional(
      v.pipe(v.string(), v.url(), v.startsWith("https://")),
      "https://gguk.org",
    ),
    /*
     * [앱팀 요청] iOS Team ID — 10자.
     * Apple Developer > Membership. AASA의 appIDs 앞부분이 된다.
     */
    IOS_TEAM_ID: v.optional(v.pipe(v.string(), v.length(10))),
    /*
     * [앱팀 요청] iOS Bundle ID — 쉼표로 여러 개.
     * dev/staging 번들이 따로 있으면 전부 넣어야 그 빌드에서도 링크가 열린다.
     * 예: com.mashup.teamMino,com.mashup.teamMino.dev
     */
    IOS_BUNDLE_IDS: v.optional(v.pipe(v.string(), v.minLength(1))),
    /*
     * [앱팀 요청] App Store 숫자 ID. App Store Connect에 앱을 등록하면 발급된다.
     * 랜딩의 "App Store에서 받기" 링크에만 쓴다.
     */
    IOS_APP_STORE_ID: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
    /*
     * [앱팀 협의] iOS 커스텀 스킴. 유니버설 링크가 아니라 별도 메커니즘이다.
     * 카카오톡 인앱 브라우저는 유니버설 링크를 발동시키지 않아서, 앱이 깔린
     * 사용자를 앱으로 보내는 유일한 수단이 이것이다.
     */
    IOS_URL_SCHEME: v.optional(v.pipe(v.string(), v.minLength(1)), "gguk"),
    /*
     * Android 배포 패키지명.
     * assetlinks.json의 배포 엔트리와 intent:// 링크의 package= 양쪽에 쓴다.
     */
    ANDROID_PACKAGE_NAME: v.optional(v.pipe(v.string(), v.minLength(1))),
    /*
     * 배포 패키지의 SHA-256 지문 — 쉼표로 둘.
     *   1. 업로드 키 (Play에 올리는 aab 서명 키)
     *   2. Play 앱 서명 키 (Play Console > 설정 > 앱 무결성 > 앱 서명 키 인증서)
     *
     * 2번이 빠지는 실수가 잦다. Play App Signing을 쓰면 구글이 aab를 다시 서명하므로
     * 사용자 기기에 깔리는 앱의 지문은 2번이다. 빠뜨리면 프로덕션에서만 링크가 열리지 않는다.
     */
    ANDROID_SHA256_FINGERPRINTS: v.optional(v.pipe(v.string(), v.minLength(1))),
    /*
     * 디버그 빌드의 패키지명. 배포 빌드와 applicationId가 다르면 반드시 필요하다.
     *
     * Digital Asset Links는 한 엔트리에 패키지를 하나만 담는다. 그래서 지문만 위
     * 목록에 더해서는 그 빌드의 App Links가 검증되지 않고, 패키지별 엔트리가 있어야 한다.
     *
     * 미설정이면 엔트리를 만들지 않는다. 디버그 빌드에서 링크가 열리지 않을 뿐 배포와는 무관하다.
     */
    ANDROID_DEBUG_PACKAGE_NAME: v.optional(v.pipe(v.string(), v.minLength(1))),
    /** 디버그 패키지의 SHA-256 지문 — 쉼표로 여러 개. */
    ANDROID_DEBUG_SHA256_FINGERPRINTS: v.optional(
      v.pipe(v.string(), v.minLength(1)),
    ),
    /*
     * [디자인 요청] 공유 카드 이미지 URL. 절대 URL이어야 크롤러가 읽는다.
     *
     * 규격 1200x630 (landing.template.ts의 OG_IMAGE_WIDTH/HEIGHT와 같아야 한다).
     * 카카오톡·iMessage·X·슬랙이 모두 이 한 장을 쓴다. PNG 또는 JPG.
     *
     * 카카오톡이 OG를 캐싱하므로, 링크를 뿌린 뒤에 넣으면 이미 공유된 카드는
     * 바뀌지 않는다. 첫 배포 전에 채워야 한다.
     */
    OG_IMAGE_URL: v.optional(
      v.pipe(v.string(), v.url(), v.startsWith("https://")),
    ),
  }),
  /*
   * 운영(production)에서는 Cloud Tasks가 호출할 APP_BASE_URL이 반드시 https여야 한다.
   * 로컬/테스트는 http://localhost 를 허용한다.
   */
  v.check(
    (env) =>
      env.NODE_ENV !== "production" || env.APP_BASE_URL.startsWith("https://"),
    "APP_BASE_URL must use https in production",
  ),
  v.check(
    (env) => env.NODE_ENV !== "production" || env.CLOUD_TASKS_MODE === "cloud",
    "CLOUD_TASKS_MODE=local is not allowed in production",
  ),
  // 배포가 보장하는 APP_ENV=prod에서는 NODE_ENV 누락을 development로 묵인하지 않고 fail closed 한다.
  v.check(
    (env) =>
      env.APP_ENV !== "prod" ||
      (env.NODE_ENV === "production" && env.CLOUD_TASKS_MODE === "cloud"),
    "APP_ENV=prod requires NODE_ENV=production and CLOUD_TASKS_MODE=cloud",
  ),
);

export type Env = v.InferOutput<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = v.safeParse(envSchema, config);

  if (!result.success) {
    const messages = result.issues
      .map((issue) => {
        const path =
          issue.path?.map((item) => String(item.key)).join(".") ?? "unknown";

        return `${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid environment variables:\n${messages}`);
  }

  return result.output;
}
