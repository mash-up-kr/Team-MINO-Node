import { describe, expect, it } from "bun:test";
import { RoomController } from "./room.controller";

const API_PARAMETERS = "swagger/apiParameters";

describe("RoomController Swagger metadata", () => {
  it("documents the optional list-room query parameters", () => {
    const parameters = Reflect.getMetadata(
      API_PARAMETERS,
      RoomController.prototype.listRooms,
    ) as Array<{
      name: string;
      required: boolean;
      schema?: { format?: string; type?: string };
    }>;

    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "showHasPlaceId",
          required: false,
          schema: { format: "uuid", type: "string" },
        }),
        expect.objectContaining({
          name: "showUsers",
          required: false,
          schema: { type: "boolean" },
        }),
      ]),
    );
  });
});
