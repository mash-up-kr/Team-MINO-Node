import { createVertex } from "@ai-sdk/google-vertex";
import { valibotSchema } from "@ai-sdk/valibot";
import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateObject, NoObjectGeneratedError } from "ai";
import type { GenericSchema } from "valibot";
import { AppException } from "../../common/exceptions/app.exception";
import type { Env } from "../../config/env.schema";
import type { AiServiceInterface, ContentPart } from "./ai.type";

// Gemini 3.x는 global 엔드포인트 전용이라 location은 env 기본값 "global"을 사용한다.
const MODEL = "gemini-3.1-flash-lite";

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
      const { object } = await generateObject({
        model,
        schema: valibotSchema(schema),
        messages,
      });
      return object;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new AppException(
          "AI_SCHEMA_MISMATCH",
          "AI 응답이 스키마와 일치하지 않습니다.",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      throw new AppException(
        "AI_EXTRACTION_FAILED",
        "AI 추출에 실패했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // 자격증명은 ADC(Cloud Run 서비스 계정 / 로컬 gcloud)로 처리 — API 키 없음
  // project는 SDK가 ADC로 자동 해석하지 않으므로 GOOGLE_CLOUD_PROJECT로 반드시 지정해야 함
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
