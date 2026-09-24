import { describe, expect, it } from "bun:test";
import { classifyPlaceCategory, isNonPlaceCandidate } from "./place.util";

describe("classifyPlaceCategory", () => {
  it("카테고리가 없으면 other로 본다", () => {
    expect(classifyPlaceCategory(null)).toBe("other");
    expect(classifyPlaceCategory(undefined)).toBe("other");
    expect(classifyPlaceCategory("")).toBe("other");
  });

  it("카페 키워드가 있으면 cafe로 분류한다", () => {
    expect(classifyPlaceCategory("음식점 > 카페 > 커피전문점")).toBe("cafe");
    expect(classifyPlaceCategory("음식점 > 카페 > 디저트카페")).toBe("cafe");
    expect(classifyPlaceCategory("음식점 > 카페 > 베이커리")).toBe("cafe");
  });

  it("카카오 계층 문자열에서 카페가 음식점보다 우선한다", () => {
    // "음식점 > 카페 > ..."는 두 키워드를 모두 포함하므로 순서가 곧 우선순위다.
    expect(classifyPlaceCategory("음식점 > 카페 > 테이크아웃커피")).toBe(
      "cafe",
    );
  });

  it("음식점 키워드가 있으면 restaurant로 분류한다", () => {
    expect(classifyPlaceCategory("음식점 > 한식 > 국밥")).toBe("restaurant");
    expect(classifyPlaceCategory("음식점 > 일식 > 초밥")).toBe("restaurant");
    expect(classifyPlaceCategory("음식점 > 술집 > 호프")).toBe("restaurant");
  });

  it("영문 키워드는 대소문자를 가리지 않는다", () => {
    expect(classifyPlaceCategory("Cafe")).toBe("cafe");
    expect(classifyPlaceCategory("BAKERY")).toBe("cafe");
    expect(classifyPlaceCategory("Restaurant")).toBe("restaurant");
  });

  it("어느 키워드에도 걸리지 않으면 other로 본다", () => {
    expect(classifyPlaceCategory("여행 > 관광,명소 > 공원")).toBe("other");
    expect(classifyPlaceCategory("문화,예술 > 미술관")).toBe("other");
  });
});

describe("isNonPlaceCandidate", () => {
  it("운영 DB에서 실제 오염된 지명성 후보를 잡는다", () => {
    expect(
      isNonPlaceCandidate({
        category: "교통,수송 > 지하철,전철 > 수도권6호선",
        placeName: "대흥역 6호선",
      }),
    ).toBe(true);
    expect(
      isNonPlaceCandidate({
        category: "교통,수송 > 도로시설 > 교차로",
        placeName: "역곡북부역사거리",
      }),
    ).toBe(true);
    expect(
      isNonPlaceCandidate({
        category: "교통,수송 > 기차,철도 > 기차역 > KTX정차역",
        placeName: "용산역",
      }),
    ).toBe(true);
    expect(
      isNonPlaceCandidate({
        category: "교통,수송 > 지하철,전철 > 지하철출구",
        placeName: "문래역 2호선 7번출구(임시폐쇄)",
      }),
    ).toBe(true);
    expect(
      isNonPlaceCandidate({
        category: "교통,수송 > 교통시설 > 주차장 > 공영주차장",
        placeName: "송림식당길 노상공영주차장",
      }),
    ).toBe(true);
  });

  it("실제 장소 후보는 남긴다", () => {
    expect(
      isNonPlaceCandidate({
        category: "음식점 > 간식 > 닭강정",
        placeName: "구천구백닭강정 역곡점",
      }),
    ).toBe(false);
    expect(
      isNonPlaceCandidate({
        category: "음식점 > 카페 > 커피전문점",
        placeName: "어니언 성수",
      }),
    ).toBe(false);
    // 지명이 이름에 들어가도 점포면 장소다.
    expect(
      isNonPlaceCandidate({ category: "음식점 > 분식", placeName: "역전우동" }),
    ).toBe(false);
  });

  it("카테고리가 없으면 이름 끝 패턴으로 판정한다", () => {
    expect(isNonPlaceCandidate({ placeName: "역곡역" })).toBe(true);
    expect(isNonPlaceCandidate({ placeName: "역곡북부역사거리" })).toBe(true);
    expect(isNonPlaceCandidate({ placeName: "군자역 5호선" })).toBe(true);
    expect(isNonPlaceCandidate({ placeName: "어니언 성수" })).toBe(false);
  });

  it("카테고리가 실제 장소를 가리키면 이름을 보지 않는다", () => {
    // "정류장"이라는 이름의 가게가 오분류되지 않게 하기 위한 가드다.
    expect(
      isNonPlaceCandidate({
        category: "음식점 > 술집 > 포차",
        placeName: "정류장",
      }),
    ).toBe(false);
  });
});
