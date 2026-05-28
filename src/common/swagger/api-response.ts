import { type Type } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";

export function DataResponse<T>(type: Type<T>) {
  class DataResponseClass {
    @ApiProperty({ type })
    data!: T;
  }
  Object.defineProperty(DataResponseClass, "name", {
    value: `DataResponse${type.name}`,
  });
  return DataResponseClass;
}

export function DataArrayResponse<T>(type: Type<T>) {
  class DataArrayResponseClass {
    @ApiProperty({ type, isArray: true })
    data!: T[];
  }
  Object.defineProperty(DataArrayResponseClass, "name", {
    value: `DataArrayResponse${type.name}`,
  });
  return DataArrayResponseClass;
}
