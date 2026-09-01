import { Query } from "@nestjs/common";
import { ApiQuery } from "@nestjs/swagger";
import { toJsonSchema } from "@valibot/to-json-schema";
import type * as v from "valibot";
import { ValibotPipe } from "../pipes/valibot.pipe";
import type { SchemaObject } from "./schema";

type QueryJsonSchema = {
  properties?: Record<string, SchemaObject>;
  required?: string[];
};

/** 쿼리 파라미터 검증과 Swagger 명세를 valibot 스키마 하나에서 만든다. 설명은 `v.description()`으로 붙인다. */
export function QuerySchema(schema: v.GenericSchema): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    Query(new ValibotPipe(schema))(target, propertyKey, parameterIndex);

    // ApiQuery는 메서드 데코레이터라 핸들러 descriptor가 필요하다.
    const descriptor = propertyKey
      ? Object.getOwnPropertyDescriptor(target, propertyKey)
      : undefined;
    if (!propertyKey || !descriptor) return;

    const { properties = {}, required = [] } = toJsonSchema(schema, {
      errorMode: "ignore",
    }) as QueryJsonSchema;

    for (const [name, { description, ...property }] of Object.entries(
      properties,
    )) {
      ApiQuery({
        name,
        required: required.includes(name),
        description,
        schema: property,
      })(target, propertyKey, descriptor);
    }
  };
}
