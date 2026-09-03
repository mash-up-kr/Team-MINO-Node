import { describe, expect, it } from "bun:test";
import { classifyPlaceCategory } from "./place.util";

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
