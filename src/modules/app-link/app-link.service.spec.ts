import { describe, expect, it } from "bun:test";
import type { InvitationService } from "../invitation/invitation.service";
import type { AppLinkConfig } from "./app-link.config";
import { AppLinkService } from "./app-link.service";

const CODE = "XL9AJC";

function createService(overrides: Partial<AppLinkConfig> = {}) {
  const config = {
    webOrigin: "https://gguk.org",
    appleAppIds: ["D2DRA3F792.com.mashup.teamMino"],
    androidPackageName: "com.mino.gguk",
    androidAppLinks: [
      { packageName: "com.mino.gguk", fingerprints: ["4F:73:8D", "C7:55:56"] },
      { packageName: "com.mino.gguk.qa", fingerprints: ["A1:43:2E"] },
    ],
    iosScheme: "gguk",
    appStoreId: "6806306129",
    ogImageUrl: "https://gguk.org/og/invite.png",
    hasApple: true,
    ...overrides,
  } as AppLinkConfig;

  const invitationService = {
    preview: async () => ({
      room: {
        id: "room-id",
        type: "shared" as const,
        name: "우리끼리",
        description: null,
        color: "black",
        pinCount: 12,
        memberCount: 3,
        members: [],
      },
      inviter: { nickname: "이영", avatar: null },
    }),
  } as unknown as InvitationService;

  return new AppLinkService(config, invitationService);
}

describe("AppLinkService", () => {
  describe("apple-app-site-association", () => {
    it("appIDs와 /r/* 컴포넌트를 담는다", () => {
      expect(createService().appleAppSiteAssociation()).toEqual({
        applinks: {
          details: [
            {
              appIDs: ["D2DRA3F792.com.mashup.teamMino"],
              components: [{ "/": "/r/*" }],
            },
          ],
        },
      });
    });

    it("iOS 식별자가 없으면 파일을 내보내지 않는다", () => {
      const service = createService({ hasApple: false, appleAppIds: [] });

      expect(service.appleAppSiteAssociation()).toBeUndefined();
    });
  });

  describe("assetlinks.json", () => {
    it("배포 패키지의 지문 둘을 한 엔트리에 담는다", () => {
      const [entry] = createService().assetLinks() ?? [];

      expect(entry?.target.package_name).toBe("com.mino.gguk");
      // 업로드 키와 Play 앱 서명 키. Play가 aab를 다시 서명해 둘이 다르다.
      expect(entry?.target.sha256_cert_fingerprints).toEqual([
        "4F:73:8D",
        "C7:55:56",
      ]);
    });

    /*
     * 디버그 빌드는 applicationId가 달라서 지문만 배포 엔트리에 더해서는 검증되지 않는다.
     * Digital Asset Links가 한 엔트리에 패키지를 하나만 담기 때문이다.
     */
    it("디버그 패키지를 별도 엔트리로 만든다", () => {
      const entries = createService().assetLinks() ?? [];

      expect(entries).toHaveLength(2);
      expect(entries[1]?.target.package_name).toBe("com.mino.gguk.qa");
      expect(entries[1]?.target.sha256_cert_fingerprints).toEqual(["A1:43:2E"]);
    });

    it("Android 식별자가 없으면 파일을 내보내지 않는다", () => {
      expect(
        createService({ androidAppLinks: [] }).assetLinks(),
      ).toBeUndefined();
    });
  });

  describe("Android intent 링크", () => {
    it("App Links를 그대로 타도록 scheme=https로 감싼다", async () => {
      const { androidAppUrl } = await createService().landing(CODE);

      expect(androidAppUrl).toContain(`intent://gguk.org/r/${CODE}#Intent`);
      expect(androidAppUrl).toContain("scheme=https");
      // package를 명시해야 링크 검증이 실패한 상태에서도 앱이 열린다.
      expect(androidAppUrl).toContain("package=com.mino.gguk");
      expect(androidAppUrl?.endsWith(";end")).toBe(true);
    });

    it("fallback_url에 referrer를 이중 인코딩해 싣는다", async () => {
      const { androidAppUrl } = await createService().landing(CODE);

      /*
       * 이 버튼으로 설치한 사용자는 Play Install Referrer로만 코드를 복원할 수 있다.
       * fallback_url 자체가 인코딩된 값이라 referrer의 '='가 두 번 인코딩된다.
       *   code=XL9AJC → code%3DXL9AJC → code%253DXL9AJC
       */
      expect(androidAppUrl).toContain(`referrer%3Dcode%253D${CODE}`);
      expect(androidAppUrl).not.toContain(`referrer%3Dcode%3D${CODE}`);
    });

    it("fallback_url을 디코딩하면 referrer가 붙은 스토어 주소가 나온다", async () => {
      const { androidAppUrl } = await createService().landing(CODE);
      const encoded = androidAppUrl?.match(
        /S\.browser_fallback_url=([^;]+)/,
      )?.[1];

      expect(decodeURIComponent(encoded ?? "")).toBe(
        `https://play.google.com/store/apps/details?id=com.mino.gguk&referrer=code%3D${CODE}`,
      );
    });
  });

  describe("iOS 링크", () => {
    it("커스텀 스킴을 쓴다", async () => {
      // 카카오톡 인앱 브라우저는 유니버설 링크를 발동시키지 않는다.
      const { iosAppUrl } = await createService().landing(CODE);

      expect(iosAppUrl).toBe(`gguk://r/${CODE}`);
    });

    it("App Store ID가 없으면 스토어 링크를 만들지 않는다", async () => {
      const { appStoreUrl } = await createService({
        appStoreId: undefined,
      }).landing(CODE);

      expect(appStoreUrl).toBeUndefined();
    });
  });

  it("초대 링크는 apex 오리진 + /r/{code}다", () => {
    expect(createService().inviteUrl(CODE)).toBe(`https://gguk.org/r/${CODE}`);
  });
});
