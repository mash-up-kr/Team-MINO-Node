import { describe, expect, it, mock } from "bun:test";
import { UserService } from "./user.service";

describe("UserService.updatePushToken", () => {
  it("repository에 userId·token을 그대로 위임한다", async () => {
    const updatePushToken = mock(() => Promise.resolve());
    const service = new UserService({ updatePushToken } as never);

    await service.updatePushToken("user-1", "token-1");

    expect(updatePushToken).toHaveBeenCalledWith("user-1", "token-1");
  });
});
