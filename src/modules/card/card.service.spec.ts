import { describe, expect, it } from "bun:test";
import { assignLabels } from "./card.service";
import type { CandidateRow } from "./card.type";

let seq = 0;

type Overrides = Partial<
  Pick<
    CandidateRow,
    "manyComments" | "manySaves" | "manyViews" | "staleness" | "createdAt"
  >
> & { id?: string };

function candidate(overrides: Overrides = {}): CandidateRow {
  seq += 1;
  const id = overrides.id ?? `pin-${String(seq).padStart(3, "0")}`;
  // 지정이 없으면 생성 순서대로 묵힌 것부터가 되도록 seq를 시각에 반영한다.
  const createdAt = overrides.createdAt ?? new Date(2026, 0, seq);
  return {
    id,
    roomId: "room-1",
    createdAt,
    staleness: overrides.staleness ?? createdAt,
    place: {
      id: `place-${id}`,
      provider: "kakao",
      providerPlaceId: `kakao-${id}`,
      name: "레이어스튜디오 10",
      address: "서울 성동구 상원4길 10",
      city: null,
      district: null,
      lat: 37.5,
      lng: 127.0,
      category: null,
      phone: null,
      externalUrl: null,
    },
    images: null,
    author: null,
    manyComments: overrides.manyComments ?? 0,
    manySaves: overrides.manySaves ?? 0,
    manyViews: overrides.manyViews ?? 0,
  };
}

/** 후보 순서를 유지한 [id, label] 목록. */
function labelsOf(rows: CandidateRow[]) {
  return assignLabels(rows).map((card) => [card.id, card.labelGroup]);
}

function labelById(rows: CandidateRow[]) {
  return new Map(labelsOf(rows) as [string, string][]);
}

describe("assignLabels", () => {
  it("가볼 만한 곳이 묵힌 순으로 4장을 먼저 가져간다", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      candidate({
        id: `p${index}`,
        staleness: new Date(2026, 0, index + 1),
        // 전부 지표를 갖게 해서 우선순위가 아니라 순서로 갈리는지 본다.
        manySaves: 5,
        manyComments: 5,
        manyViews: 5,
      }),
    );

    const worth = assignLabels(rows)
      .filter((card) => card.labelGroup === "worthVisiting")
      .map((card) => card.id);

    expect(worth).toEqual(["p0", "p1", "p2", "p3"]);
  });

  it("여럿이 → 이야기 → 친구들 순으로 배정한다", () => {
    // 앞 4장은 가볼 만한 곳이 가져가므로 뒤 6장으로 우선순위를 확인한다.
    const filler = Array.from({ length: 4 }, (_, index) =>
      candidate({ id: `filler${index}`, staleness: new Date(2026, 0, 1) }),
    );
    const rows = [
      ...filler,
      candidate({ id: "all", manySaves: 9, manyComments: 9, manyViews: 9 }),
      candidate({ id: "saves", manySaves: 3 }),
      candidate({ id: "comments", manyComments: 3 }),
      candidate({ id: "comments2", manyComments: 2 }),
      candidate({ id: "views", manyViews: 3 }),
      candidate({ id: "views2", manyViews: 2 }),
    ];

    const byId = labelById(rows);
    // 셋 다 자격이 있으면 가장 앞선 여럿이 저장한 곳이 가져간다.
    expect(byId.get("all")).toBe("manySaves");
    expect(byId.get("saves")).toBe("manySaves");
    expect(byId.get("comments")).toBe("manyComments");
    expect(byId.get("comments2")).toBe("manyComments");
    expect(byId.get("views")).toBe("manyViews");
    expect(byId.get("views2")).toBe("manyViews");
  });

  it("지표가 자격에 못 미치면 가볼 만한 곳이 흡수한다", () => {
    // 신규 방: 코멘트·클릭 0, 저장된 방도 1곳뿐이라 지표 라벨이 하나도 성립하지 않는다.
    const rows = Array.from({ length: 10 }, () => candidate({ manySaves: 1 }));

    const labels = assignLabels(rows).map((card) => card.labelGroup);

    expect(labels).toHaveLength(10);
    expect(new Set(labels)).toEqual(new Set(["worthVisiting"]));
  });

  it("한 방에만 저장된 장소는 여럿이 저장한 곳이 아니다", () => {
    const filler = Array.from({ length: 4 }, (_, index) =>
      candidate({ id: `filler${index}`, staleness: new Date(2026, 0, 1) }),
    );
    const rows = [
      ...filler,
      candidate({ id: "one-room", manySaves: 1 }),
      candidate({ id: "two-rooms", manySaves: 2 }),
    ];

    const byId = labelById(rows);
    expect(byId.get("two-rooms")).toBe("manySaves");
    expect(byId.get("one-room")).toBe("worthVisiting");
  });

  it("응답이 후보 순서를 그대로 유지한다", () => {
    const rows = [
      candidate({ id: "first", manyComments: 9 }),
      candidate({ id: "second" }),
      candidate({ id: "third", manySaves: 9 }),
    ];

    expect(assignLabels(rows).map((card) => card.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("후보가 10장보다 적으면 있는 만큼만 반환한다", () => {
    const rows = [candidate({ id: "a" }), candidate({ id: "b" })];

    expect(assignLabels(rows)).toHaveLength(2);
  });

  it("지표가 같으면 묵힌 쪽을 먼저 뽑는다", () => {
    const filler = Array.from({ length: 4 }, (_, index) =>
      candidate({ id: `filler${index}`, staleness: new Date(2026, 0, 1) }),
    );
    const rows = [
      ...filler,
      candidate({
        id: "newer",
        manyComments: 3,
        staleness: new Date(2026, 5, 1),
      }),
      candidate({
        id: "older",
        manyComments: 3,
        staleness: new Date(2026, 2, 1),
      }),
      candidate({
        id: "newest",
        manyComments: 3,
        staleness: new Date(2026, 8, 1),
      }),
    ];

    const picked = assignLabels(rows)
      .filter((card) => card.labelGroup === "manyComments")
      .map((card) => card.id);

    expect(picked).toEqual(["newer", "older"]);
  });

  it("모든 후보가 정확히 하나의 라벨을 받는다", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      candidate({
        id: `p${index}`,
        manySaves: index % 3 === 0 ? 2 : 0,
        manyComments: index % 3 === 1 ? 1 : 0,
        manyViews: index % 3 === 2 ? 1 : 0,
      }),
    );

    const cards = assignLabels(rows);

    expect(cards).toHaveLength(10);
    expect(new Set(cards.map((card) => card.id)).size).toBe(10);
  });
});
