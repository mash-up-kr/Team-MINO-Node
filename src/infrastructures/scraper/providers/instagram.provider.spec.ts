import { describe, expect, it } from "bun:test";
import { InstagramProvider } from "./instagram.provider";

describe("InstagramProvider", () => {
  it("fetchPost는 아직 구현되지 않아 에러를 던진다", async () => {
    // given
    const provider = new InstagramProvider();

    // when
    const call = provider.fetchPost("https://www.instagram.com/p/abc123/");

    // then
    await expect(call).rejects.toThrow("Not implemented");
  });
});
