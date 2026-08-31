import { describe, expect, it } from "bun:test";
import { RoomController } from "./room.controller";

const API_PARAMETERS = "swagger/apiParameters";
const API_RESPONSE = "swagger/apiResponse";

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

  it("documents invalid list-room query values as VALIDATION_ERROR", () => {
    const responses = Reflect.getMetadata(
      API_RESPONSE,
      RoomController.prototype.listRooms,
    ) as Record<
      string,
      { description: string; schema: { properties: { errorCode: unknown } } }
    >;

    expect(responses["400"]).toEqual(
      expect.objectContaining({
        description:
          "showHasPlaceId가 UUID가 아니거나 showUsers가 true/false가 아님 (VALIDATION_ERROR)",
        schema: expect.objectContaining({
          properties: expect.objectContaining({ errorCode: expect.anything() }),
        }),
      }),
    );
  });
});
