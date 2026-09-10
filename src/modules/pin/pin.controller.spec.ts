import { describe, expect, it } from "bun:test";
import { PinController } from "./pin.controller";
import { pinDetailResponseApiSchema } from "./pin.dto";

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

  it("documents required base fields for pin details", () => {
    const schema = pinDetailResponseApiSchema as {
      properties: { data: { required?: string[] } };
    };

    expect(schema.properties.data.required).toEqual([
      "id",
      "roomId",
      "place",
      "images",
      "createdBy",
      "commentCount",
      "createdAt",
    ]);
  });
});
