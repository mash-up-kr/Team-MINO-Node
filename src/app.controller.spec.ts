import { describe, expect, it } from "vitest";
import { AppController } from "./app.controller";

describe("AppController", () => {
  it("returns ok status", () => {
    const controller = new AppController();

    expect(controller.getHealth()).toEqual({
      status: "ok",
    });
  });
});
