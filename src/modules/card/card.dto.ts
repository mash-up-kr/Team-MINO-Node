import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { SchemaObject } from "../../common/swagger/schema";
import { LABEL_GROUPS, SORT_OPTIONS } from "./card.type";

export const uuidParamSchema = v.pipe(v.string(), v.uuid());

/** 쿼리 파라미터는 문자열로 들어오므로 숫자 변환을 포함한다. */
const coordinateSchema = (min: number, max: number, label: string) =>
  v.pipe(
    v.string(),
    v.regex(/^-?\d+(\.\d+)?$/, `${label}는 숫자여야 합니다.`),
    v.transform(Number),
    v.minValue(min),
    v.maxValue(max),
  );

/**
 * `sort`는 후보 집합을 좁히는 필터다. 기본값은 `ggukPick`.
 * `nearby`는 요청 유저 위치를 기준으로 하므로 좌표가 함께 와야 한다.
 */
export const listCardsQuerySchema = v.pipe(
  v.object({
    sort: v.optional(v.picklist(SORT_OPTIONS), "ggukPick"),
    lat: v.optional(coordinateSchema(-90, 90, "lat")),
    lng: v.optional(coordinateSchema(-180, 180, "lng")),
  }),
  v.check(
    (query) =>
      query.sort !== "nearby" ||
      (query.lat !== undefined && query.lng !== undefined),
    "sort=nearby는 lat·lng가 필요합니다.",
  ),
);

export type ListCardsQuery = v.InferOutput<typeof listCardsQuerySchema>;

export const listCardsQueryApiSchema = toJsonSchema(listCardsQuerySchema, {
  errorMode: "ignore",
}) as SchemaObject;

const placeSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    provider: { type: "string", enum: ["kakao", "google"] },
    providerPlaceId: { type: "string" },
    name: { type: "string" },
    address: { type: "string" },
    city: { type: "string", nullable: true },
    district: { type: "string", nullable: true },
    lat: { type: "number" },
    lng: { type: "number" },
    category: { type: "string", nullable: true },
    phone: { type: "string", nullable: true },
    mapUrl: { type: "string", nullable: true },
  },
};

const cardSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    roomId: { type: "string", format: "uuid" },
    place: placeSchema,
    images: { type: "array", items: { type: "string" } },
    createdBy: {
      type: "object",
      nullable: true,
      properties: {
        userId: { type: "string", format: "uuid" },
        nickname: { type: "string" },
        avatar: {
          type: "object",
          nullable: true,
          properties: { color: { type: "string" } },
        },
      },
    },
    createdAt: { type: "string", format: "date-time" },
    labelGroup: { type: "string", enum: [...LABEL_GROUPS] },
  },
};

export const cardListResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    data: { type: "array", maxItems: 10, items: cardSchema },
  },
};

export const errorResponseApiSchema: SchemaObject = {
  type: "object",
  properties: {
    errorCode: { type: "string", example: "NOT_ROOM_MEMBER" },
    message: { type: "string" },
  },
};
