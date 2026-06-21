import "reflect-metadata";
import { beforeEach, describe, expect, it } from "bun:test";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import * as v from "valibot";
import { AiModule } from "./ai.module";
import { AiService } from "./ai.service";

describe("AiService", () => {
  let service: AiService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AiModule,
      ],
    }).compile();
    service = module.get(AiService);
  });

  it("DI 컨테이너에서 AiService를 해석한다", () => {
    expect(service).toBeInstanceOf(AiService);
  });

  it("extract는 아직 구현되지 않아 에러를 던진다", async () => {
    // when
    const call = service.extract(v.object({ name: v.string() }), [
      { type: "text", text: "hello" },
    ]);

    // then
    await expect(call).rejects.toThrow("Not implemented");
  });
});
