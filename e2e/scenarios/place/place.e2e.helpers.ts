import { jest } from "bun:test";
import { randomUUID } from "node:crypto";
import { type INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { CloudTasksGuard } from "../../../src/common/guards/cloud-tasks.guard";
import type { PinExtractionTask } from "../../../src/common/tasks/pin-extraction-task.dto";
import { AiService } from "../../../src/infrastructures/ai/ai.service";
import { DatabaseService } from "../../../src/infrastructures/db/database.service";
import { GEOCODER_PROVIDERS } from "../../../src/infrastructures/geocoder/geocoder.service";
import type { GeoCandidate } from "../../../src/infrastructures/geocoder/geocoder.type";
import { PlaceImageService } from "../../../src/infrastructures/place-image/place-image.service";
import { ScraperService } from "../../../src/infrastructures/scraper/scraper.service";
import type { ScrapedPost } from "../../../src/infrastructures/scraper/scraper.type";
import { SentryErrorReporter } from "../../../src/infrastructures/sentry/sentry-reporter";
import { TasksService } from "../../../src/infrastructures/tasks/tasks.service";
import { places } from "../../../src/modules/place/place.schema";
import { rooms } from "../../../src/modules/room/room.schema";
import { roomMembers } from "../../../src/modules/room/room-member.schema";
import { sources } from "../../../src/modules/source/source.schema";
import { users } from "../../../src/modules/user/user.schema";
import { authHeaders, withFakeTokenVerifier } from "../../auth";
import { startApp } from "../../start-app";

export const POST_URL = "https://www.instagram.com/p/e2e-pin/";
export const NORMALIZED_POST_URL = "https://instagram.com/p/e2e-pin/";
export const POST: ScrapedPost = {
  shortcode: "e2e-pin",
  typename: "image",
  caption: "성수동 카페 코스",
  imageUrls: ["https://cdn.example/1.jpg"],
  owner: { id: "1", username: "tester", fullName: "테스터" },
  location: null,
};
export const CANDIDATES: readonly GeoCandidate[] = [
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
  {
    provider: "kakao",
    providerPlaceId: "kakao-e2e-3",
    placeName: "낮은 순위 후보",
    address: "서울 성동구 연무장길 1",
    coordinate: { lat: 37.544, lng: 127.057 },
  },
];

export class PlaceE2eHarness {
  readonly instagram = { fetchPost: jest.fn() };
  readonly ai = { extract: jest.fn() };
  readonly geocoder = { name: "kakao", search: jest.fn() };
  readonly enqueuePinExtraction = jest.fn(
    async (task: PinExtractionTask): Promise<void> => {
      this.capturedTask = task;
    },
  );
  readonly placeImage = { storePostImages: jest.fn().mockResolvedValue([]) };

  private app: INestApplication | undefined;
  private database: DatabaseService["db"] | undefined;
  private baseUrl = "";
  private _memberAuthUid = "";
  private outsiderAuthUid = "";
  private memberId = "";
  private roomId = "";
  private secondRoomId = "";
  private capturedTask: PinExtractionTask | undefined;

  async setup(): Promise<void> {
    const started = await startApp(
      withFakeTokenVerifier(
        Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(TasksService)
          .useValue({ enqueuePinExtraction: this.enqueuePinExtraction })
          .overrideProvider(ScraperService)
          .useValue(this.instagram)
          .overrideProvider(AiService)
          .useValue(this.ai)
          .overrideProvider(GEOCODER_PROVIDERS)
          .useValue([this.geocoder])
          .overrideGuard(CloudTasksGuard)
          .useValue({
            canActivate: (ctx: {
              switchToHttp: () => {
                getRequest: () => {
                  headers: Record<string, string | undefined>;
                };
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
          .useValue(this.placeImage)
          .overrideProvider(SentryErrorReporter)
          .useValue({ report: () => undefined }),
      ),
    );
    this.app = started.app;
    this.baseUrl = started.baseUrl;
    this.database = this.app.get(DatabaseService).db;
  }

  async reset(): Promise<void> {
    this._memberAuthUid = `e2e-pin-member-${randomUUID()}`;
    this.outsiderAuthUid = `e2e-pin-outsider-${randomUUID()}`;
    this.capturedTask = undefined;
    this.enqueuePinExtraction.mockReset();
    this.enqueuePinExtraction.mockImplementation(
      async (task: PinExtractionTask): Promise<void> => {
        this.capturedTask = task;
      },
    );
    this.instagram.fetchPost.mockReset();
    this.ai.extract.mockReset();
    this.geocoder.search.mockReset();
    this.instagram.fetchPost.mockResolvedValue(POST);
    this.ai.extract.mockResolvedValue({
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
    this.geocoder.search.mockImplementation(
      async (query: { placeName: string }) =>
        query.placeName === "어니언 성수" ? [CANDIDATES[0]] : [CANDIDATES[1]],
    );
    await this.db.execute(sql`truncate table ${sources} cascade`);
    await this.db.execute(sql`truncate table ${places} cascade`);
    await this.db.execute(sql`truncate table ${users} cascade`);

    const [member, outsider] = await this.db
      .insert(users)
      .values([
        { authUid: this._memberAuthUid, nickname: "핀러버" },
        { authUid: this.outsiderAuthUid, nickname: "외부인" },
      ])
      .returning({ id: users.id });
    this.memberId = member?.id ?? "";
    const outsiderId = outsider?.id ?? "";
    const [room] = await this.db
      .insert(rooms)
      .values({
        ownerId: this.memberId,
        type: "shared",
        name: "핀 방",
        color: "black",
      })
      .returning({ id: rooms.id });
    this.roomId = room?.id ?? "";
    await this.db.insert(roomMembers).values({
      roomId: this.roomId,
      userId: this.memberId,
    });
    const [secondRoom] = await this.db
      .insert(rooms)
      .values({
        ownerId: this.memberId,
        type: "shared",
        name: "두 번째 핀 방",
        color: "black",
      })
      .returning({ id: rooms.id });
    this.secondRoomId = secondRoom?.id ?? "";
    await this.db.insert(roomMembers).values({
      roomId: this.secondRoomId,
      userId: this.memberId,
    });
    await this.db.insert(rooms).values({
      ownerId: outsiderId,
      type: "shared",
      name: "남의 방",
      color: "black",
    });
  }

  async close(): Promise<void> {
    await this.app?.close();
  }

  get db(): DatabaseService["db"] {
    if (this.database === undefined) throw new Error("E2E app is not ready");
    return this.database;
  }

  get task(): PinExtractionTask | undefined {
    return this.capturedTask;
  }

  get member(): string {
    return this.memberId;
  }

  get memberAuthUid(): string {
    return this._memberAuthUid;
  }

  get room(): string {
    return this.roomId;
  }

  get secondRoom(): string {
    return this.secondRoomId;
  }

  get outsider(): string {
    return this.outsiderAuthUid;
  }

  async postPin(
    authUid = this._memberAuthUid,
    body: unknown = { url: POST_URL, roomIds: [this.roomId] },
  ): Promise<Response> {
    return this.api("/api/v1/rooms/pins", authUid, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async runTask(
    task: PinExtractionTask | undefined = this.capturedTask,
  ): Promise<Response> {
    return this.internalTask(task, true);
  }

  async runUnauthorizedTask(): Promise<Response> {
    return this.internalTask(this.capturedTask, false);
  }

  async runMalformedTask(): Promise<Response> {
    return this.internalTask({ url: POST_URL }, true);
  }

  private internalTask(body: unknown, authorized: boolean): Promise<Response> {
    return fetch(`${this.baseUrl}/api-internal/v1/tasks/pins`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorized ? { "x-test-authorized": "yes" } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  private api(path: string, authUid: string, init: RequestInit = {}) {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...authHeaders(authUid),
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  }
}
