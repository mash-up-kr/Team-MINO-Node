import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { invitations } from "../../../src/modules/invitation/invitation.schema";
import { rooms } from "../../../src/modules/room/room.schema";
import { roomMembers } from "../../../src/modules/room/room-member.schema";
import { users } from "../../../src/modules/user/user.schema";
import { withFakeTokenVerifier } from "../../auth";
import { startApp } from "../../start-app";

let app: INestApplication;
let baseUrl: string;

const ownerAuthUid = `e2e-applink-owner-${randomUUID()}`;
/** 6자 대문자 영숫자. invitations.code 정책과 같아야 통과한다. */
const CODE = "AB12CD";

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    withFakeTokenVerifier(Test.createTestingModule({ imports: [AppModule] })),
  ));
  const db = app.get(DatabaseService).db;

  const [owner] = await db
    .insert(users)
    .values({
      authUid: ownerAuthUid,
      nickname: "이영",
      avatar: { color: "red" },
    })
    .returning({ id: users.id });
  const ownerId = owner?.id as string;

  const [room] = await db
    .insert(rooms)
    .values({
      ownerId,
      type: "shared",
      name: "우리끼리",
      description: "테스트 방",
      color: "black",
    })
    .returning({ id: rooms.id });
  const roomId = room?.id as string;

  await db.insert(roomMembers).values({ roomId, userId: ownerId });
  await db
    .insert(invitations)
    .values({ roomId, invitedBy: ownerId, code: CODE });
});

afterAll(async () => {
  await app.close();
});

describe("GET /.well-known/apple-app-site-association", () => {
  /*
   * iOS는 응답 본문의 최상위가 { applinks: ... }이길 기대한다. 공통 { data } 봉투가
   * 한 겹만 씌워져도 파일 전체를 무시하므로, 봉투가 없다는 것 자체가 검증 대상이다.
   */
  it("data 봉투 없이 applinks를 최상위에 둔다", async () => {
    const response = await fetch(
      `${baseUrl}/.well-known/apple-app-site-association`,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("data");
    expect(body.applinks.details[0].components).toEqual([{ "/": "/r/*" }]);
  });

  it("Content-Type이 application/json이다", async () => {
    const response = await fetch(
      `${baseUrl}/.well-known/apple-app-site-association`,
    );

    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

describe("GET /.well-known/assetlinks.json", () => {
  it("data 봉투 없이 배열을 그대로 반환한다", async () => {
    const response = await fetch(`${baseUrl}/.well-known/assetlinks.json`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].relation).toEqual([
      "delegate_permission/common.handle_all_urls",
    ]);
  });
});

describe("GET /r/:code", () => {
  it("HTML을 반환한다", async () => {
    const response = await fetch(`${baseUrl}/r/${CODE}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toStartWith("<!doctype html>");
  });

  /*
   * 화면에는 초대자만 보이고 방 이름은 넣지 않는다(디자인 확정). 대신 공유 카드의
   * og:description이 방 설명이나 장소·멤버 수를 실어 맥락을 남긴다.
   */
  it("초대자를 제목에, 방 맥락을 공유 카드 설명에 담는다", async () => {
    const html = await (await fetch(`${baseUrl}/r/${CODE}`)).text();

    expect(html).toContain(
      'property="og:title" content="이영님이 공동방에 초대했어요"',
    );
    expect(html).toContain('property="og:description" content="테스트 방"');
  });

  it("두 플랫폼의 앱 실행 링크를 함께 심는다", async () => {
    const html = await (await fetch(`${baseUrl}/r/${CODE}`)).text();

    /*
     * 서버가 UA로 갈라 렌더링하면 캐시가 다른 플랫폼에 잘못된 HTML을 내준다.
     * 두 링크를 모두 심고 브라우저 스크립트가 고르게 한다.
     */
    expect(html).toContain(`gguk://r/${CODE}`);
    expect(html).toContain("intent://");
  });

  /*
   * 카카오톡·iMessage·슬랙은 Open Graph를, X는 twitter:card를 읽는다.
   * 이미지는 한 장으로 양쪽을 커버한다.
   */
  it("공유 카드 메타를 노출한다", async () => {
    const html = await (await fetch(`${baseUrl}/r/${CODE}`)).text();

    expect(html).toContain('property="og:image"');
    expect(html).toContain('property="og:image:alt"');
    expect(html).toContain('property="og:site_name"');
    expect(html).toContain('property="og:locale"');
    // X 전용. 이미지·제목은 og:*로 폴백하므로 카드 타입만 지정하면 된다.
    expect(html).toContain('content="summary_large_image"');
  });

  /*
   * 형식이 틀린 코드와 없는 코드는 도달 경로가 다르지만(400은 파이프, 200은 렌더러)
   * 보는 사람에게는 같은 상황이라 같은 화면을 준다.
   */
  it("잘못된 형식의 코드는 400 + 오류 화면이다", async () => {
    const response = await fetch(`${baseUrl}/r/toolongcode`);

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("사용할 수 없어요");
    expect(html).toContain("코드가 만료됐거나 유효하지 않아요.");
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).not.toContain("errorCode");
  });

  /*
   * 없는 코드여도 앱으로 보낼 수 있어야 한다. 앱이 설치돼 있으면 앱 쪽 에러
   * 화면이 낫고, 앱은 어차피 이 경우를 처리해야 한다 — 설치자가 링크를 직접
   * 누르면 OS가 코드 검증 없이 앱을 열기 때문이다.
   */
  it("없는 코드도 버튼이 있는 페이지를 준다", async () => {
    const response = await fetch(`${baseUrl}/r/ZZ99ZZ`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("사용할 수 없어요");
    expect(html).toContain("gguk://r/ZZ99ZZ");
    expect(html).toContain("intent://");
    expect(html).toContain(">꾹으로 이동하기</button>");
    expect(html).not.toContain("errorCode");
  });

  /*
   * 초대 코드는 그 자체가 방의 접근 권한이라, 색인되면 링크를 받지 않은 사람도
   * 검색으로 방에 들어올 수 있다. 유효 여부와 무관하게 막는다.
   */
  it("유효 여부와 무관하게 색인되지 않게 한다", async () => {
    const valid = await (await fetch(`${baseUrl}/r/${CODE}`)).text();
    const missing = await (await fetch(`${baseUrl}/r/ZZ99ZZ`)).text();

    expect(valid).toContain('name="robots" content="noindex"');
    expect(missing).toContain('name="robots" content="noindex"');
  });
});

/*
 * 랜딩 HTML이 가리키는 폰트·일러스트. Firebase Hosting이 아니라 이 서버가
 * 직접 서빙하므로(config/static-assets.ts) 라우팅이 살아 있는지 확인한다.
 */
describe("랜딩 정적 파일", () => {
  it("HTML이 참조하는 에셋을 그대로 내려준다", async () => {
    const html = await (await fetch(`${baseUrl}/r/${CODE}`)).text();
    const assets = [
      ...html.matchAll(/(?:src|url\()"?(\/(?:img|fonts)\/[^"')]+)/g),
    ].map((match) => match[1] as string);

    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      const response = await fetch(`${baseUrl}${asset}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("max-age=86400");
    }
  });

  it("없는 파일은 404다", async () => {
    const response = await fetch(`${baseUrl}/img/nope.png`);

    expect(response.status).toBe(404);
  });
});
