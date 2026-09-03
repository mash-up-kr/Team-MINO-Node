import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import { listPinsQuerySchema } from "./pin.dto";

const validRoomId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("listPinsQuerySchema", () => {
  it("기본 쿼리 파라미터(sort=all, category=all)로 파싱된다", () => {
    const parsed = v.parse(listPinsQuerySchema, { roomId: validRoomId });
    expect(parsed).toEqual({
      roomId: validRoomId,
      sort: "all",
      category: "all",
    });
  });

  it("roomId 없이 전체 방 조회 쿼리로 파싱된다", () => {
    const parsed = v.parse(listPinsQuerySchema, {});
    expect(parsed.roomId).toBeUndefined();
    expect(parsed.sort).toBe("all");
    expect(parsed.category).toBe("all");
  });

  it("5종 정렬 옵션을 모두 허용한다", () => {
    const sorts = [
      "all",
      "ggukPick",
      "latest",
      "distance",
      "commented",
    ] as const;
    for (const sort of sorts) {
      if (sort === "distance") {
        const parsed = v.parse(listPinsQuerySchema, {
          roomId: validRoomId,
          sort,
          lat: "37.5665",
          lng: "126.9780",
        });
        expect(parsed.sort).toBe("distance");
        expect(parsed.lat).toBe(37.5665);
        expect(parsed.lng).toBe(126.978);
      } else {
        const parsed = v.parse(listPinsQuerySchema, {
          roomId: validRoomId,
          sort,
        });
        expect(parsed.sort).toBe(sort);
      }
    }
  });

  it("sort=distance일 때 lat/lng가 없으면 검증에 실패한다", () => {
    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        sort: "distance",
      }),
    ).toThrow("sort=distance는 lat·lng가 필요합니다.");

    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        sort: "distance",
        lat: "37.5665",
      }),
    ).toThrow("sort=distance는 lat·lng가 필요합니다.");
  });

  it("3종 카테고리 옵션을 허용한다", () => {
    const categories = ["all", "cafe", "restaurant"] as const;
    for (const category of categories) {
      const parsed = v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        category,
      });
      expect(parsed.category).toBe(category);
    }
  });

  it("유효하지 않은 sort/category는 실패한다", () => {
    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        sort: "invalid_sort",
      }),
    ).toThrow();

    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        category: "invalid_category",
      }),
    ).toThrow();
  });

  it("page 파라미터 경계값 및 비정상 값(Infinity/음수)을 차단한다", () => {
    // 정상 범위
    const valid = v.parse(listPinsQuerySchema, {
      roomId: validRoomId,
      page: "0",
    });
    expect(valid.page).toBe(0);

    // 음수 차단
    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        page: "-1",
      }),
    ).toThrow();

    // Infinity 유발 초거대 숫자 차단
    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        page: "999999999999999999999999999999999999999999999999999999999999",
      }),
    ).toThrow();
  });

  it("lat/lng 좌표의 경계값(-90~90, -180~180)과 이상값(1e5, Infinity, NaN, 부호)을 엄격히 검증한다", () => {
    // 정확한 극점 및 날짜변경선 경계값 허용
    const boundary = v.parse(listPinsQuerySchema, {
      roomId: validRoomId,
      sort: "distance",
      lat: "90",
      lng: "180",
    });
    expect(boundary.lat).toBe(90);
    expect(boundary.lng).toBe(180);

    const minBoundary = v.parse(listPinsQuerySchema, {
      roomId: validRoomId,
      sort: "distance",
      lat: "-90",
      lng: "-180",
    });
    expect(minBoundary.lat).toBe(-90);
    expect(minBoundary.lng).toBe(-180);

    // 범위 초과 차단
    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        sort: "distance",
        lat: "90.0001",
        lng: "127.0",
      }),
    ).toThrow();

    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        sort: "distance",
        lat: "37.5",
        lng: "180.0001",
      }),
    ).toThrow();

    // 지수 표기법, Infinity, NaN, 문자열 등 비표준 입력 차단
    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        sort: "distance",
        lat: "1e5",
        lng: "127.0",
      }),
    ).toThrow();

    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        sort: "distance",
        lat: "Infinity",
        lng: "127.0",
      }),
    ).toThrow();

    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        sort: "distance",
        lat: "NaN",
        lng: "127.0",
      }),
    ).toThrow();

    expect(() =>
      v.parse(listPinsQuerySchema, {
        roomId: validRoomId,
        sort: "distance",
        lat: "+37.5",
        lng: "127.0",
      }),
    ).toThrow();
  });
});
