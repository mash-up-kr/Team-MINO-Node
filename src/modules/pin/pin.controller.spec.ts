import { describe, expect, it } from "bun:test";
import { PinController } from "./pin.controller";

describe("PinController Swagger metadata", () => {
  it("documents the list-pins query parameters from the schema", () => {
    const parameters = Reflect.getMetadata(
      "swagger/apiParameters",
      PinController.prototype.listPins,
    ) as Array<{ name: string; required: boolean }>;

    expect(parameters.map((p) => p.name).sort()).toEqual([
      "category",
      "lat",
      "lng",
      "page",
      "pageSize",
      "roomId",
      "sort",
    ]);
    expect(parameters.every((p) => p.required === false)).toBe(true);
  });
});
