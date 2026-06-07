import * as v from "valibot";
import { describe, expect, it } from "bun:test";
import { AppException } from "../exceptions/app.exception";
import { ValibotPipe } from "./valibot.pipe";

const TestSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  age: v.pipe(v.number(), v.minValue(0)),
});

describe("ValibotPipe", () => {
  const pipe = new ValibotPipe(TestSchema);

  it("유효한 데이터는 파싱된 결과를 반환한다", () => {
    expect(pipe.transform({ name: "홍길동", age: 20 })).toEqual({
      name: "홍길동",
      age: 20,
    });
  });

  it("유효하지 않은 데이터는 VALIDATION_ERROR AppException을 던진다", () => {
    let caught: unknown;
    try {
      pipe.transform({ name: "", age: -1 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppException);
    expect((caught as AppException).errorCode).toBe("VALIDATION_ERROR");
    expect((caught as AppException).getStatus()).toBe(400);
    expect((caught as AppException).message).toMatch(/name:.*age:/);
  });

  it("필수 필드 누락 시 400 에러와 누락 필드명을 포함한 메시지를 던진다", () => {
    let caught: unknown;
    try {
      pipe.transform({ name: "홍길동" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppException);
    expect((caught as AppException).getStatus()).toBe(400);
    expect((caught as AppException).message).toMatch(/age:/);
  });
});
