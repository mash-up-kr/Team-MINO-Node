import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { GenericSchema } from "valibot";
import type { Env } from "../../config/env.schema";
import type { AiServiceInterface, ContentPart } from "./ai.type";

@Injectable()
export class AiService implements AiServiceInterface {
  constructor(private readonly configService: ConfigService<Env>) {}

  async extract<T>(
    _schema: GenericSchema<T>,
    _content: ContentPart[],
  ): Promise<T> {
    throw new Error("Not implemented");
  }
}
