import { HttpStatus, type PipeTransform } from "@nestjs/common";
import * as v from "valibot";
import { AppException } from "../exceptions/app.exception";

export class ValibotPipe<T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>
  implements PipeTransform
{
  constructor(private readonly schema: T) {}

  transform(value: unknown): v.InferOutput<T> {
    const result = v.safeParse(this.schema, value);

    if (!result.success) {
      const flat = v.flatten(result.issues);
      const fields = flat.nested ?? {};
      const message =
        Object.keys(fields).length > 0
          ? Object.entries(fields)
              .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
              .join(" / ")
          : (flat.root?.join(", ") ?? "Validation failed");

      throw new AppException("VALIDATION_ERROR", message, HttpStatus.BAD_REQUEST);
    }

    return result.output;
  }
}
