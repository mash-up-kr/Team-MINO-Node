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
      const fields = v.flatten(result.issues).nested ?? {};
      const message =
        Object.keys(fields).length > 0
          ? Object.entries(fields)
              .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
              .join(" / ")
          : (v.flatten(result.issues).root?.join(", ") ?? "Validation failed");

      throw new AppException("VALIDATION_ERROR", message, HttpStatus.BAD_REQUEST);
    }

    return result.output;
  }
}
