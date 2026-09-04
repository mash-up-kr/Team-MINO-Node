import { expect, it } from "bun:test";
import { HttpStatus } from "@nestjs/common";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { AppException } from "../../../src/common/exceptions/app.exception";
import { notifications } from "../../../src/modules/notification/notification.schema";
import { pins } from "../../../src/modules/pin/pin.schema";
import { places } from "../../../src/modules/place/place.schema";
import { roomMembers } from "../../../src/modules/room/room-member.schema";
import { placeSources } from "../../../src/modules/source/place-source.schema";
import { CANDIDATES, PlaceE2eHarness } from "./place.e2e.helpers";

export function registerWorkerPlaceScenarios(harness: PlaceE2eHarness): void {
  it("worker는 한 번 추출한 장소를 선택한 모든 방에 저장한다", async () => {
    await harness.postPin(harness.memberAuthUid, {
      url: "https://instagram.com/p/e2e-pin/",
      roomIds: [harness.room, harness.secondRoom],
    });

    const response = await harness.runTask();

    expect(response.status).toBe(204);
    expect(harness.instagram.fetchPost).toHaveBeenCalledTimes(1);
    expect(
      await harness.db.select().from(pins).where(eq(pins.roomId, harness.room)),
    ).toHaveLength(2);
    expect(
      await harness.db
        .select()
        .from(pins)
        .where(eq(pins.roomId, harness.secondRoom)),
    ).toHaveLength(2);
  });

  it("작업 대기 중 나간 방은 제외하고 남은 방에만 저장한다", async () => {
    await harness.postPin(harness.memberAuthUid, {
      url: "https://instagram.com/p/e2e-pin/",
      roomIds: [harness.room, harness.secondRoom],
    });
    await harness.db
      .update(roomMembers)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(roomMembers.roomId, harness.secondRoom),
          eq(roomMembers.userId, harness.member),
        ),
      );

    const response = await harness.runTask();

    expect(response.status).toBe(204);
    expect(
      await harness.db.select().from(pins).where(eq(pins.roomId, harness.room)),
    ).toHaveLength(2);
    expect(
      await harness.db
        .select()
        .from(pins)
        .where(eq(pins.roomId, harness.secondRoom)),
    ).toHaveLength(0);
  });

  it("모든 대상 방이 무효해지면 추출하지 않고 acknowledge한다", async () => {
    await harness.postPin();
    await harness.db
      .update(roomMembers)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(roomMembers.roomId, harness.room),
          eq(roomMembers.userId, harness.member),
        ),
      );

    const response = await harness.runTask();

    expect(response.status).toBe(204);
    expect(harness.instagram.fetchPost).not.toHaveBeenCalled();
  });

  it("worker는 logical place마다 ranked top1만 저장하고 source/place/pin 연결을 만든다", async () => {
    await harness.postPin();
    harness.geocoder.search.mockImplementation(
      async (query: { placeName: string }) =>
        query.placeName === "어니언 성수"
          ? [CANDIDATES[1], CANDIDATES[2]]
          : [CANDIDATES[0]],
    );
    const response = await harness.runTask();
    const sourceId = harness.task?.sourceId ?? "";
    const links = await harness.db
      .select({ placeId: placeSources.placeId })
      .from(placeSources)
      .where(eq(placeSources.sourceId, sourceId));
    const storedPlaces = await harness.db
      .select({ providerPlaceId: places.providerPlaceId })
      .from(places)
      .where(
        inArray(
          places.id,
          links.map((link) => link.placeId),
        ),
      );

    expect(response.status).toBe(204);
    expect(links).toHaveLength(2);
    expect(storedPlaces.map((place) => place.providerPlaceId).sort()).toEqual([
      "kakao-e2e-1",
      "kakao-e2e-2",
    ]);
    expect(
      await harness.db
        .select()
        .from(places)
        .where(eq(places.providerPlaceId, "kakao-e2e-3")),
    ).toHaveLength(0);
    expect(
      await harness.db.select().from(pins).where(eq(pins.roomId, harness.room)),
    ).toHaveLength(2);
  });

  it("서로 다른 추출 결과가 같은 실제 장소로 지오코딩되면 중복 없이 하나만 저장한다", async () => {
    // 배치 upsert에 같은 provider+providerPlaceId가 두 번 들어가면 Postgres가
    // "ON CONFLICT DO UPDATE command cannot affect row a second time"로 통째로
    // 실패해 아무것도 저장되지 않는 회귀가 있었다 — 저장 전에 중복 제거해야 한다.
    await harness.postPin();
    harness.geocoder.search.mockImplementation(async () => [CANDIDATES[0]]);
    const response = await harness.runTask();
    const sourceId = harness.task?.sourceId ?? "";

    expect(response.status).toBe(204);
    expect(
      await harness.db
        .select()
        .from(places)
        .where(eq(places.providerPlaceId, "kakao-e2e-1")),
    ).toHaveLength(1);
    expect(
      await harness.db
        .select({ placeId: placeSources.placeId })
        .from(placeSources)
        .where(eq(placeSources.sourceId, sourceId)),
    ).toHaveLength(1);
    expect(
      await harness.db.select().from(pins).where(eq(pins.roomId, harness.room)),
    ).toHaveLength(1);
  });

  it("partial transient는 성공분을 commit하고 503 후 재배달에서 누락분만 추가한다", async () => {
    await harness.postPin();
    harness.geocoder.search.mockImplementation(
      async (query: { placeName: string }) => {
        if (query.placeName === "대림창고")
          throw new AppException(
            "GEOCODER_PROVIDER_FAILED",
            "provider down",
            HttpStatus.SERVICE_UNAVAILABLE,
            { retryable: true },
          );
        return [CANDIDATES[0]];
      },
    );
    const first = await harness.runTask();
    const sourceId = harness.task?.sourceId ?? "";
    const firstLinks = await harness.db
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
      await harness.db
        .select()
        .from(pins)
        .where(and(eq(pins.roomId, harness.room), isNull(pins.deletedAt))),
    ).toHaveLength(1);

    harness.geocoder.search.mockImplementation(
      async (query: { placeName: string }) =>
        query.placeName === "어니언 성수" ? [CANDIDATES[0]] : [CANDIDATES[1]],
    );
    const second = await harness.runTask();
    const secondLinks = await harness.db
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
      await harness.db
        .select()
        .from(pins)
        .where(and(eq(pins.roomId, harness.room), isNull(pins.deletedAt))),
    ).toHaveLength(2);
  });

  it("동일 task 중복 배달은 누락 데이터만 추가하고 중복하지 않는다", async () => {
    await harness.postPin();
    await harness.runTask();
    const duplicate = await harness.runTask();
    const sourceId = harness.task?.sourceId ?? "";

    expect(duplicate.status).toBe(204);
    expect(
      await harness.db
        .select()
        .from(placeSources)
        .where(
          and(
            eq(placeSources.sourceId, sourceId),
            isNull(placeSources.deletedAt),
          ),
        ),
    ).toHaveLength(2);
    expect(
      await harness.db
        .select()
        .from(pins)
        .where(and(eq(pins.roomId, harness.room), isNull(pins.deletedAt))),
    ).toHaveLength(2);
  });

  it("worker는 GCS에 저장된 이미지의 공개 URL을 places.images에 남긴다", async () => {
    const images = [
      "https://storage.googleapis.com/bucket/instagram/e2e-pin/000",
      "https://storage.googleapis.com/bucket/instagram/e2e-pin/001",
    ];
    harness.placeImage.storePostImages.mockResolvedValue(
      images.map((publicUrl, index) => ({
        gsUri: `gs://bucket/instagram/e2e-pin/00${index}`,
        publicUrl,
        mediaType: "image/jpeg",
      })),
    );
    await harness.postPin();

    const response = await harness.runTask();

    expect(response.status).toBe(204);
    const stored = await harness.db
      .select({ images: places.images })
      .from(places);
    expect(stored).toHaveLength(2);
    for (const place of stored) {
      expect(place.images).toEqual(images);
    }
  });

  it("모델이 고른 인덱스대로 장소별 이미지를 핀에 나눠 담는다", async () => {
    const images = [
      "https://storage.googleapis.com/bucket/instagram/e2e-pin/000",
      "https://storage.googleapis.com/bucket/instagram/e2e-pin/001",
    ];
    harness.placeImage.storePostImages.mockResolvedValue(
      images.map((publicUrl, index) => ({
        gsUri: `gs://bucket/instagram/e2e-pin/00${index}`,
        publicUrl,
        mediaType: "image/jpeg",
      })),
    );
    await harness.postPin();

    expect((await harness.runTask()).status).toBe(204);

    // 기본 추출 mock은 어니언 성수 → 0번, 대림창고 → 1번을 가리킨다.
    const saved = await harness.db
      .select({ name: places.name, images: pins.images })
      .from(pins)
      .innerJoin(places, eq(places.id, pins.placeId));
    expect(saved).not.toHaveLength(0);
    for (const pin of saved) {
      expect(pin.images).toEqual(
        pin.name === "어니언 성수" ? [images[0]] : [images[1]],
      );
    }
  });

  it("모델이 인덱스를 못 고르면 게시물 전체 이미지로 폴백한다", async () => {
    const images = [
      "https://storage.googleapis.com/bucket/instagram/e2e-pin/000",
      "https://storage.googleapis.com/bucket/instagram/e2e-pin/001",
    ];
    harness.placeImage.storePostImages.mockResolvedValue(
      images.map((publicUrl, index) => ({
        gsUri: `gs://bucket/instagram/e2e-pin/00${index}`,
        publicUrl,
        mediaType: "image/jpeg",
      })),
    );
    // 범위를 벗어난 인덱스와 빈 배열 — 둘 다 폴백 대상이다.
    harness.ai.extract.mockResolvedValueOnce({
      places: [
        {
          place_name: "어니언 성수",
          area_name: "성수동",
          area_type: "landmark",
          relation: "첫 코스",
          image_indices: [7, -1],
        },
        {
          place_name: "대림창고",
          area_name: "성수동",
          area_type: "landmark",
          relation: "둘째 코스",
          image_indices: [],
        },
      ],
    });
    await harness.postPin();

    expect((await harness.runTask()).status).toBe(204);

    const saved = await harness.db.select({ images: pins.images }).from(pins);
    expect(saved).not.toHaveLength(0);
    for (const pin of saved) {
      expect(pin.images).toEqual(images);
    }
  });

  /*
   * 같은 장소가 이미지 없는 다른 글로 재유입될 때 upsert가 excluded.images를 그대로
   * 쓰면 멀쩡한 썸네일이 NULL로 덮인다. coalesce가 그걸 막는지 본다.
   */
  it("이미지 없는 글로 같은 장소를 다시 저장해도 기존 images는 유지된다", async () => {
    const images = ["https://storage.googleapis.com/bucket/instagram/e2e/000"];
    harness.placeImage.storePostImages.mockResolvedValue([
      {
        gsUri: "gs://bucket/instagram/e2e/000",
        publicUrl: images[0],
        mediaType: "image/jpeg",
      },
    ]);
    await harness.postPin();
    expect((await harness.runTask()).status).toBe(204);

    harness.placeImage.storePostImages.mockResolvedValue([]);
    const response = await harness.runTask();

    expect(response.status).toBe(204);
    const stored = await harness.db
      .select({ images: places.images })
      .from(places);
    expect(stored).toHaveLength(2);
    for (const place of stored) {
      expect(place.images).toEqual(images);
    }
  });

  it("worker malformed task는 영구 오류로 acknowledge한다", async () => {
    const malformed = await harness.runMalformedTask();

    expect(malformed.status).toBe(204);
    expect(harness.instagram.fetchPost).not.toHaveBeenCalled();
  });

  it("worker route는 OIDC authorization이 없으면 401이고 추출하지 않는다", async () => {
    await harness.postPin();
    const response = await harness.runUnauthorizedTask();

    expect(response.status).toBe(401);
    expect(harness.instagram.fetchPost).not.toHaveBeenCalled();
  });

  it("soft-delete 후 재배달은 새 active rows만 만든다", async () => {
    await harness.postPin();
    await harness.runTask();
    const sourceId = harness.task?.sourceId ?? "";
    const links = await harness.db
      .select({ placeId: placeSources.placeId })
      .from(placeSources)
      .where(eq(placeSources.sourceId, sourceId));
    await harness.db
      .update(pins)
      .set({ deletedAt: new Date() })
      .where(eq(pins.roomId, harness.room));
    await harness.db
      .update(placeSources)
      .set({ deletedAt: new Date() })
      .where(eq(placeSources.sourceId, sourceId));
    await harness.db
      .update(places)
      .set({ deletedAt: new Date() })
      .where(
        inArray(
          places.id,
          links.map((link) => link.placeId),
        ),
      );

    const response = await harness.runTask();
    const activeLinks = await harness.db
      .select({ placeId: placeSources.placeId })
      .from(placeSources)
      .where(
        and(
          eq(placeSources.sourceId, sourceId),
          isNull(placeSources.deletedAt),
        ),
      );

    expect(response.status).toBe(204);
    expect(activeLinks).toHaveLength(2);
    expect(
      await harness.db
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
    ).toHaveLength(2);
    expect(
      await harness.db
        .select()
        .from(pins)
        .where(and(eq(pins.roomId, harness.room), isNull(pins.deletedAt))),
    ).toHaveLength(2);
  });
}

export function registerDuplicateNotificationScenarios(
  harness: PlaceE2eHarness,
): void {
  const EXTRACTED_PLACES = 2;

  const duplicateNotifications = () =>
    harness.db
      .select({
        targetName: notifications.targetName,
        key: notifications.key,
        payload: notifications.payload,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, harness.member),
          eq(notifications.type, "PIN_DUPLICATED"),
          isNull(notifications.deletedAt),
        ),
      );

  it("이미 저장돼 있던 장소만 중복으로 알린다", async () => {
    // given
    await harness.postPin();
    expect((await harness.runTask()).status).toBe(204);
    expect(await duplicateNotifications()).toHaveLength(0);

    // when
    await harness.postPin();
    const response = await harness.runTask();

    // then
    expect(response.status).toBe(204);
    expect(await duplicateNotifications()).toHaveLength(EXTRACTED_PLACES);
  });

  it("재배달로 같은 task를 다시 처리해도 중복 알림이 생기지 않는다", async () => {
    // given
    await harness.postPin();
    expect((await harness.runTask()).status).toBe(204);
    await harness.postPin();
    const duplicatedTask = harness.task;
    expect((await harness.runTask(duplicatedTask)).status).toBe(204);
    expect(await duplicateNotifications()).toHaveLength(EXTRACTED_PLACES);

    // when
    expect((await harness.runTask(duplicatedTask)).status).toBe(204);

    // then
    expect(await duplicateNotifications()).toHaveLength(EXTRACTED_PLACES);
  });

  it("저장 시도가 다르면 같은 장소라도 별개 행으로 남는다", async () => {
    // given
    await harness.postPin();
    expect((await harness.runTask()).status).toBe(204);

    // when
    await harness.postPin();
    expect((await harness.runTask()).status).toBe(204);
    await harness.postPin();
    expect((await harness.runTask()).status).toBe(204);

    // then
    expect(await duplicateNotifications()).toHaveLength(EXTRACTED_PLACES * 2);
  });

  it("중복 알림은 방 수와 무관하게 장소당 한 건이다", async () => {
    // given
    const bothRooms = {
      url: "https://instagram.com/p/e2e-pin/",
      roomIds: [harness.room, harness.secondRoom],
    };
    await harness.postPin(harness.memberAuthUid, bothRooms);
    expect((await harness.runTask()).status).toBe(204);

    // when
    await harness.postPin(harness.memberAuthUid, bothRooms);
    expect((await harness.runTask()).status).toBe(204);

    // then
    const rows = await duplicateNotifications();
    expect(rows).toHaveLength(EXTRACTED_PLACES);
    expect(new Set(rows.map((row) => row.key)).size).toBe(EXTRACTED_PLACES);
    for (const row of rows) {
      expect(CANDIDATES.map((c) => c.placeName)).toContain(row.targetName);
      const payload = row.payload as { placeId: string; pinId: string };
      const [newest] = await harness.db
        .select({ id: pins.id })
        .from(pins)
        .where(and(eq(pins.placeId, payload.placeId), isNull(pins.deletedAt)))
        .orderBy(desc(pins.createdAt), desc(pins.id))
        .limit(1);
      expect(payload.pinId).toBe(newest?.id);
    }
  });
}

export function registerSaveFailedScenarios(harness: PlaceE2eHarness): void {
  const failedNotifications = () =>
    harness.db
      .select({ key: notifications.key, payload: notifications.payload })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, harness.member),
          eq(notifications.type, "SAVE_FAILED"),
          isNull(notifications.deletedAt),
        ),
      );

  it("인식된 장소가 없으면 저장 실패를 알린다", async () => {
    harness.ai.extract.mockResolvedValue({ places: [] });
    await harness.postPin();

    expect((await harness.runTask()).status).toBe(204);

    const rows = await failedNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toBeNull();
  });

  it("영구 실패는 재시도 없이 한 번만 알린다", async () => {
    harness.instagram.fetchPost.mockRejectedValue(
      new AppException(
        "INVALID_INSTAGRAM_URL",
        "Instagram URL이 올바르지 않습니다.",
        HttpStatus.BAD_REQUEST,
      ),
    );
    await harness.postPin();

    expect((await harness.runTask()).status).toBe(204);
    expect((await harness.runTask()).status).toBe(204);

    expect(await failedNotifications()).toHaveLength(1);
  });

  it("저장에 성공하면 실패를 알리지 않는다", async () => {
    await harness.postPin();

    expect((await harness.runTask()).status).toBe(204);

    expect(await failedNotifications()).toHaveLength(0);
  });
}
