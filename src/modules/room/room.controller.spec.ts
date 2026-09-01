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
      schema?: { format?: string; type?: string; enum?: string[] };
    }>;

    // 스키마 파생이라 문자열 쿼리의 실제 허용값이 그대로 드러난다.
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
          schema: { type: "string", enum: ["true", "false"] },
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
          "전달한 showHasPlaceId 값이 UUID 형식이 아니거나 showUsers 값이 true 또는 false가 아닌 경우 (VALIDATION_ERROR)",
        schema: expect.objectContaining({
          properties: expect.objectContaining({ errorCode: expect.anything() }),
        }),
      }),
    );
  });
});
