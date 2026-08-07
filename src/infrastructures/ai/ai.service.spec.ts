import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import type { ConfigService } from "@nestjs/config";
import * as v from "valibot";
import { AppException } from "../../common/exceptions/app.exception";

// ai / vertex / valibot 어댑터를 모킹한 뒤 AiService를 동적 import 한다.
const generateText = mock();
class NoObjectGeneratedError extends Error {
  static isInstance(error: unknown): error is NoObjectGeneratedError {
    return error instanceof NoObjectGeneratedError;
  }
}
mock.module("ai", () => ({
  generateText,
  NoObjectGeneratedError,
  Output: { object: (options: unknown) => options },
}));
mock.module("@ai-sdk/google-vertex", () => ({
  createVertex: () => (id: string) => ({ id }),
}));
mock.module("@ai-sdk/valibot", () => ({
  valibotSchema: (schema: unknown) => schema,
}));

let AiService: typeof import("./ai.service").AiService;
beforeAll(async () => {
  ({ AiService } = await import("./ai.service"));
});

const schema = v.object({ name: v.string() });

function makeService() {
  const config = { get: () => undefined } as unknown as ConfigService;
  return new AiService(config);
}

describe("AiService", () => {
  beforeEach(() => generateText.mockReset());
  afterAll(() => mock.restore());

  it("멀티모달 content를 모델 메시지로 변환하고 output을 반환한다", async () => {
    // given
    generateText.mockResolvedValue({ output: { name: "어니언" } });

    // when
    const result = await makeService().extract(schema, [
      { type: "text", text: "hello" },
      { type: "image", url: "gs://bucket/abc123/0", mediaType: "image/png" },
    ]);

    // then
    expect(result).toEqual({ name: "어니언" });
    const content = generateText.mock.calls[0][0].messages[0].content;
    expect(content[0]).toEqual({ type: "text", text: "hello" });
    expect(content[1].type).toBe("image");
    // url은 URL 인스턴스로 넘겨 SDK가 fileData.fileUri로 매핑한다(gs://는 Vertex가 직접 읽음).
    expect(String(content[1].image)).toBe("gs://bucket/abc123/0");
    expect(content[1].mediaType).toBe("image/png");
  });

  it("NoObjectGeneratedError는 AI_SCHEMA_MISMATCH(422)로 변환한다", async () => {
    // given
    generateText.mockRejectedValue(new NoObjectGeneratedError("invalid"));

    // when
    const promise = makeService().extract(schema, [
      { type: "text", text: "x" },
    ]);

    // then
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await expect(promise).rejects.toMatchObject({
      errorCode: "AI_SCHEMA_MISMATCH",
    });
  });

  it("그 외 에러는 AI_EXTRACTION_FAILED(502)로 변환한다", async () => {
    // given
    generateText.mockRejectedValue(new Error("network down"));

    // when
    const promise = makeService().extract(schema, [
      { type: "text", text: "x" },
    ]);

    // then
    await expect(promise).rejects.toMatchObject({
      errorCode: "AI_EXTRACTION_FAILED",
    });
  });
});
