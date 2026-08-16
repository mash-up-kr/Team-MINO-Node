import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { type INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { CloudTasksGuard } from "../../../src/common/guards/cloud-tasks.guard";
import { AiService } from "../../../src/infrastructures/ai/ai.service";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { GEOCODER_PROVIDERS } from "../../../src/infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../../src/infrastructures/geocoder/geocoder.type";
import { PlaceImageService } from "../../../src/infrastructures/place-image/place-image.service";
import { ScraperService } from "../../../src/infrastructures/scraper/scraper.service";
import type { ScrapedPost } from "../../../src/infrastructures/scraper/scraper.type";
import { SentryErrorReporter } from "../../../src/infrastructures/sentry/sentry-reporter";
import { TasksService } from "../../../src/infrastructures/tasks/tasks.service";
import type { PinExtractionTask } from "../../../src/modules/pin/pin.dto";
import { pins } from "../../../src/modules/pin/pin.schema";
import { places } from "../../../src/modules/place/place.schema";
import { rooms } from "../../../src/modules/room/room.schema";
import { roomMembers } from "../../../src/modules/room/room-member.schema";
import { placeSources } from "../../../src/modules/source/place-source.schema";
import { sources } from "../../../src/modules/source/source.schema";
import { users } from "../../../src/modules/user/user.schema";
import { startApp } from "../../start-app";

const POST_URL = "https://www.instagram.com/p/e2e-pin/";
const POST: ScrapedPost = {
  shortcode: "e2e-pin",
  typename: "image",
  caption: "성수동 카페 코스",
  imageUrls: ["https://cdn.example/1.jpg"],
  owner: { id: "1", username: "tester", fullName: "테스터" },
  location: null,
};
const CANDIDATES: GeoCandidate[] = [
  {
    provider: "kakao",
    providerPlaceId: "kakao-e2e-1",
    placeName: "어니언 성수",
    address: "서울 성동구 아차산로 8",
    coordinate: { lat: 37.5445, lng: 127.0559 },
  },
  {
    provider: "kakao",
    providerPlaceId: "kakao-e2e-2",
    placeName: "대림창고",
    address: "서울 성동구 성수이로 78",
    coordinate: { lat: 37.5412, lng: 127.0561 },
  },
];

const instagram = { fetchPost: jest.fn() };
const ai = { extract: jest.fn() };
const geocoder = { name: "kakao", search: jest.fn() };
const enqueuePinExtraction = jest.fn(
  async (task: PinExtractionTask): Promise<void> => {
    capturedTask = task;
  },
);
const placeImage = { storePostImages: jest.fn().mockResolvedValue([]) };
let capturedTask: PinExtractionTask | undefined;
let app: INestApplication;
let baseUrl: string;
let db: DatabaseService["db"];
let memberDevice: string;
let outsiderDevice: string;
let memberId: string;
let roomId: string;

beforeAll(async () => {
  ({ app, baseUrl } = await startApp(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TasksService)
      .useValue({ enqueuePinExtraction })
      .overrideProvider(ScraperService)
      .useValue(instagram)
      .overrideProvider(AiService)
      .useValue(ai)
      .overrideProvider(GEOCODER_PROVIDERS)
      .useValue([geocoder])
      .overrideGuard(CloudTasksGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => {
            getRequest: () => { headers: Record<string, string | undefined> };
          };
        }) => {
          if (
            ctx.switchToHttp().getRequest().headers["x-test-authorized"] ===
            "yes"
          ) {
            return true;
          }
          throw new UnauthorizedException("missing OIDC token");
        },
      })
      .overrideProvider(PlaceImageService)
      .useValue(placeImage)
      .overrideProvider(SentryErrorReporter)
      .useValue({ report: () => undefined }),
  ));
  db = app.get(DatabaseService).db;
});

beforeEach(async () => {
  memberDevice = `e2e-pin-member-${randomUUID()}`;
  outsiderDevice = `e2e-pin-outsider-${randomUUID()}`;
  capturedTask = undefined;
  enqueuePinExtraction.mockClear();
  instagram.fetchPost.mockReset();
  ai.extract.mockReset();
  geocoder.search.mockReset();
  instagram.fetchPost.mockResolvedValue(POST);
  ai.extract.mockResolvedValue({
    places: [
      {
        place_name: "어니언 성수",
        area_name: "성수동",
        area_type: "landmark",
        relation: "첫 코스",
      },
      {
        place_name: "대림창고",
        area_name: "성수동",
        area_type: "landmark",
        relation: "둘째 코스",
      },
    ],
  });
  geocoder.search.mockImplementation(async (query: { placeName: string }) =>
    query.placeName === "어니언 성수" ? [CANDIDATES[0]] : [CANDIDATES[1]],
  );
  await db.execute(sql`truncate table ${sources} cascade`);
  await db.execute(sql`truncate table ${users} cascade`);

  const [member, outsider] = await db
    .insert(users)
    .values([
      { deviceId: memberDevice, nickname: "핀러버" },
      { deviceId: outsiderDevice, nickname: "외부인" },
    ])
    .returning({ id: users.id });
  memberId = member?.id ?? "";
  const outsiderId = outsider?.id ?? "";
  const [room] = await db
    .insert(rooms)
    .values({
      ownerId: memberId,
      type: "shared",
      name: "핀 방",
      color: "black",
    })
    .returning({ id: rooms.id });
  roomId = room?.id ?? "";
  await db.insert(roomMembers).values({ roomId, userId: memberId });
  await db.insert(rooms).values({
    ownerId: outsiderId,
    type: "shared",
    name: "남의 방",
    color: "black",
  });
});

afterAll(async () => {
  await app.close();
});

function api(path: string, deviceId: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "X-Device-Id": deviceId,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

function postPin(deviceId = memberDevice, body: unknown = { url: POST_URL }) {
  return api(`/api/v1/rooms/${roomId}/pins`, deviceId, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function runTask(task: PinExtractionTask | undefined = capturedTask) {
  return fetch(`${baseUrl}/api-internal/v1/tasks/pins`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-authorized": "yes",
    },
    body: JSON.stringify(task),
  });
}

describe("방 핀 추출 enqueue와 worker", () => {
  it("멤버십을 먼저 확인하고 source를 재사용하며 exact task payload를 enqueue한다", async () => {
    const first = await postPin();
    const second = await postPin();

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(enqueuePinExtraction).toHaveBeenCalledTimes(2);
    expect(capturedTask).toMatchObject({
      roomId,
      createdBy: memberId,
      url: POST_URL,
    });
    expect(
      await db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(eq(sources.originalUrl, POST_URL), isNull(sources.deletedAt)),
        ),
    ).toHaveLength(1);
  });

  it("worker는 logical place마다 top1만 저장하고 source/place/pin 연결을 만든다", async () => {
    await postPin();
    const response = await runTask();

    const sourceId = capturedTask?.sourceId ?? "";
    const links = await db
      .select({ placeId: placeSources.placeId })
      .from(placeSources)
      .where(eq(placeSources.sourceId, sourceId));

    expect(response.status).toBe(204);
    expect(links).toHaveLength(2);
    expect(
      await db
        .select()
        .from(places)
        .where(
          inArray(
            places.id,
            links.map((link) => link.placeId),
          ),
        ),
    ).toHaveLength(2);
    expect(
      await db.select().from(pins).where(eq(pins.roomId, roomId)),
    ).toHaveLength(2);
  });

  it("partial transient는 성공분을 commit하고 503 후 재배달에서 누락분만 추가한다", async () => {
    await postPin();
    geocoder.search.mockImplementation(async (query: { placeName: string }) => {
      if (query.placeName === "대림창고") throw new Error("provider down");
      return [CANDIDATES[0]];
    });

    const first = await runTask();
    const sourceId = capturedTask?.sourceId ?? "";
    const firstLinks = await db
      .select({ placeId: placeSources.placeId })
      .from(placeSources)
      .where(
        and(
          eq(placeSources.sourceId, sourceId),
          isNull(placeSources.deletedAt),
        ),
      );

    expect(first.status).toBe(503);
    expect(firstLinks).toHaveLength(1);
    expect(
      await db
        .select()
        .from(pins)
        .where(and(eq(pins.roomId, roomId), isNull(pins.deletedAt))),
    ).toHaveLength(1);

    geocoder.search.mockImplementation(async (query: { placeName: string }) =>
      query.placeName === "어니언 성수" ? [CANDIDATES[0]] : [CANDIDATES[1]],
    );
    const second = await runTask();
    const secondLinks = await db
      .select({ placeId: placeSources.placeId })
      .from(placeSources)
      .where(
        and(
          eq(placeSources.sourceId, sourceId),
          isNull(placeSources.deletedAt),
        ),
      );

    expect(second.status).toBe(204);
    expect(secondLinks).toHaveLength(2);
    expect(
      await db
        .select()
        .from(pins)
        .where(and(eq(pins.roomId, roomId), isNull(pins.deletedAt))),
    ).toHaveLength(2);
  });

  it("동일 task 중복 배달은 누락 데이터만 추가하고 중복하지 않는다", async () => {
    await postPin();
    await runTask();
    const duplicate = await runTask();
    const sourceId = capturedTask?.sourceId ?? "";

    expect(duplicate.status).toBe(204);
    expect(
      await db
        .select()
        .from(placeSources)
        .where(eq(placeSources.sourceId, sourceId)),
    ).toHaveLength(2);
    expect(
      await db.select().from(pins).where(eq(pins.roomId, roomId)),
    ).toHaveLength(2);
  });

  it("비멤버는 source write와 enqueue 전에 403을 받는다", async () => {
    const response = await postPin(outsiderDevice);

    expect(response.status).toBe(403);
    expect(enqueuePinExtraction).not.toHaveBeenCalled();
    expect(await db.select().from(sources)).toHaveLength(0);
  });

  it("잘못된 URL은 400이고 enqueue하지 않는다", async () => {
    const response = await postPin(memberDevice, { url: "not-a-url" });

    expect(response.status).toBe(400);
    expect(enqueuePinExtraction).not.toHaveBeenCalled();
  });

  it("evil query-domain과 notinstagram/profile URL은 source write 전에 400이다", async () => {
    const invalidUrls = [
      "https://evil.com/?next=instagram.com/p/abc123",
      "https://notinstagram.com/p/abc123",
      "https://www.instagram.com/profile",
    ];

    for (const url of invalidUrls) {
      const response = await postPin(memberDevice, { url });
      expect(response.status).toBe(400);
    }
    expect(enqueuePinExtraction).not.toHaveBeenCalled();
    expect(await db.select().from(sources)).toHaveLength(0);
  });

  it("worker malformed task는 영구 오류로 acknowledge한다", async () => {
    const response = await fetch(`${baseUrl}/api-internal/v1/tasks/pins`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-authorized": "yes",
      },
      body: JSON.stringify({ url: POST_URL }),
    });

    expect(response.status).toBe(204);
    expect(instagram.fetchPost).not.toHaveBeenCalled();
  });

  it("worker route는 OIDC authorization이 없으면 401이고 추출하지 않는다", async () => {
    await postPin();
    const response = await fetch(`${baseUrl}/api-internal/v1/tasks/pins`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(capturedTask),
    });

    expect(response.status).toBe(401);
    expect(instagram.fetchPost).not.toHaveBeenCalled();
  });

  it("enqueue 실패는 502지만 방금 upsert한 source는 다음 요청에서 재사용된다", async () => {
    enqueuePinExtraction.mockRejectedValueOnce(new Error("queue unavailable"));

    const failed = await postPin();
    const retried = await postPin();

    expect(failed.status).toBe(502);
    expect(retried.status).toBe(202);
    expect(
      await db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(eq(sources.originalUrl, POST_URL), isNull(sources.deletedAt)),
        ),
    ).toHaveLength(1);
  });

  it("soft-delete 후 재배달은 새 active rows만 만든다", async () => {
    await postPin();
    await runTask();
    const sourceId = capturedTask?.sourceId ?? "";
    const links = await db
      .select({ placeId: placeSources.placeId })
      .from(placeSources)
      .where(eq(placeSources.sourceId, sourceId));
    await db
      .update(pins)
      .set({ deletedAt: new Date() })
      .where(eq(pins.roomId, roomId));
    await db
      .update(placeSources)
      .set({ deletedAt: new Date() })
      .where(eq(placeSources.sourceId, sourceId));
    await db
      .update(places)
      .set({ deletedAt: new Date() })
      .where(
        inArray(
          places.id,
          links.map((link) => link.placeId),
        ),
      );

    const response = await runTask();
    const activeLinks = await db
      .select({ placeId: placeSources.placeId })
      .from(placeSources)
      .where(
        and(
          eq(placeSources.sourceId, sourceId),
          isNull(placeSources.deletedAt),
        ),
      );

    expect(response.status).toBe(204);
    expect(
      await db
        .select()
        .from(places)
        .where(
          and(
            inArray(
              places.id,
              activeLinks.map((link) => link.placeId),
            ),
            isNull(places.deletedAt),
          ),
        ),
    ).toHaveLength(activeLinks.length);
    expect(
      await db
        .select()
        .from(pins)
        .where(and(eq(pins.roomId, roomId), isNull(pins.deletedAt))),
    ).toHaveLength(2);
  });
});
