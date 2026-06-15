import "reflect-metadata";
import { beforeEach, describe, expect, it } from "bun:test";
import { Test } from "@nestjs/testing";
import { InstagramModule } from "./instagram.module";
import { InstagramService } from "./instagram.service";

describe("InstagramService", () => {
  let service: InstagramService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [InstagramModule],
    }).compile();
    service = module.get(InstagramService);
  });

  it("DI 컨테이너에서 InstagramService를 해석한다", () => {
    expect(service).toBeInstanceOf(InstagramService);
  });

  it("fetchPost는 아직 구현되지 않아 에러를 던진다", async () => {
    // when
    const call = service.fetchPost("https://www.instagram.com/p/abc123/");

    // then
    await expect(call).rejects.toThrow("Not implemented");
  });
});
