import { type Type } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";

export function DataResponse<T>(type: Type<T>) {
  class DataResponseClass {
    @ApiProperty({ type })
    data!: T;
  }
  return DataResponseClass;
}

export function DataArrayResponse<T>(type: Type<T>) {
  class DataArrayResponseClass {
    @ApiProperty({ type, isArray: true })
    data!: T[];
  }
  return DataArrayResponseClass;
}
