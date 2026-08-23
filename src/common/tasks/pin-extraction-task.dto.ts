import * as v from "valibot";
import { instagramUrlSchema } from "../instagram/instagram-url.dto";

const taskIdSchema = v.pipe(v.string(), v.uuid());

export const pinExtractionTaskSchema = v.object({
  roomId: taskIdSchema,
  sourceId: taskIdSchema,
  createdBy: taskIdSchema,
  url: instagramUrlSchema,
});

export type PinExtractionTask = v.InferOutput<typeof pinExtractionTaskSchema>;
