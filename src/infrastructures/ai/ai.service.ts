import { createVertex } from "@ai-sdk/google-vertex";
import { valibotSchema } from "@ai-sdk/valibot";
import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { GenericSchema } from "valibot";
import { AppException } from "../../common/exceptions/app.exception";
import type { Env } from "../../config/env.schema";
import type { AiServiceInterface, ContentPart } from "./ai.type";

// Gemini 3.x는 global 엔드포인트 전용이라 location은 env 기본값 "global"을 사용한다.
const MODEL = "gemini-3.1-flash-lite";
const AI_TIMEOUT_MS = 30_000;

@Injectable()
export class AiService implements AiServiceInterface {
  private _client?: ReturnType<typeof createVertex>;

  constructor(private readonly configService: ConfigService<Env>) {}

  async extract<T>(
    schema: GenericSchema<T>,
    content: ContentPart[],
  ): Promise<T> {
    const model = this.vertex(MODEL);
    const messages = [
      { role: "user" as const, content: this.toModelContent(content) },
    ];

    try {
      const { output } = await generateText({
        model,
        messages,
        abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
        output: Output.object({ schema: valibotSchema(schema) }),
      });
      return output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        /*
         * 모델 출력은 비결정적이라 같은 입력도 재시도하면 스키마에 맞는 응답이
         * 나올 수 있다. 4xx지만 백그라운드 재시도 대상으로 명시한다.
         */
        throw new AppException(
          "AI_SCHEMA_MISMATCH",
          "AI 응답이 스키마와 일치하지 않습니다.",
          HttpStatus.UNPROCESSABLE_ENTITY,
          { retryable: true },
        );
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AppException(
          "AI_TIMEOUT",
          "AI 응답 시간이 초과되었습니다.",
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      throw new AppException(
        "AI_EXTRACTION_FAILED",
        "AI 추출에 실패했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /*
   * 자격증명은 ADC(Cloud Run 서비스 계정 / 로컬 gcloud)로 처리 — API 키 없음.
   * project는 SDK가 ADC로 자동 해석하지 않으므로 GOOGLE_CLOUD_PROJECT로 반드시 지정해야 한다.
   */
  private get vertex() {
    this._client ??= createVertex({
      project: this.configService.get("GOOGLE_CLOUD_PROJECT", { infer: true }),
      location: this.configService.get("GOOGLE_VERTEX_LOCATION", {
        infer: true,
      }),
    });
    return this._client;
  }

  private toModelContent(content: ContentPart[]) {
    return content.map((part) => {
      return part.type === "text"
        ? { type: "text" as const, text: part.text }
        : { type: "image" as const, image: this.toImageUrl(part.url) };
    });
  }

  private toImageUrl(url: string): URL {
    try {
      return new URL(url);
    } catch {
      throw new AppException(
        "INVALID_IMAGE_URL",
        `유효하지 않은 이미지 URL입니다: ${url}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
