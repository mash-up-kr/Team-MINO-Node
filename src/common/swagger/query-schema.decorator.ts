import { Query } from "@nestjs/common";
import { ApiQuery } from "@nestjs/swagger";
import { toJsonSchema } from "@valibot/to-json-schema";
import type * as v from "valibot";
import { ValibotPipe } from "../pipes/valibot.pipe";
import type { SchemaObject } from "./schema";

type QueryJsonSchema = {
  properties?: Record<string, SchemaObject & { description?: string }>;
  required?: string[];
};

/**
 * 쿼리 파라미터 검증과 Swagger 명세를 valibot 스키마 하나에서 만든다.
 * 스키마가 유일한 출처이므로 문서가 실제 파라미터와 어긋날 수 없다.
 * 파라미터 설명은 `v.description()`으로 스키마에 붙인다.
 */
export function QuerySchema<
  T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(schema: T): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey === undefined) return;

    const json = toJsonSchema(schema, {
      errorMode: "ignore",
    }) as QueryJsonSchema;
    const required = json.required ?? [];
    // 메서드 데코레이터인 ApiQuery를 직접 적용하려면 핸들러 descriptor가 필요하다.
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);

    if (descriptor) {
      for (const [name, { description, ...property }] of Object.entries(
        json.properties ?? {},
      )) {
        ApiQuery({
          name,
          required: required.includes(name),
          description,
          schema: property,
        })(target, propertyKey, descriptor);
      }
    }

    Query(new ValibotPipe(schema))(target, propertyKey, parameterIndex);
  };
}
