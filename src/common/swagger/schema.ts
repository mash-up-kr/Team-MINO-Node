import { generateSchema } from "@nestjs/swagger";

export type SchemaObject = ReturnType<typeof generateSchema>["schema"];
