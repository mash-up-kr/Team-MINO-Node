import * as v from "valibot";
import { instagramUrlSchema } from "../instagram/instagram-url.dto";
import { MAX_ROOM_SELECTION_COUNT } from "../room/room-selection.constant";

const taskIdSchema = v.pipe(v.string(), v.uuid());

export const pinExtractionTaskSchema = v.object({
  roomIds: v.pipe(
    v.array(taskIdSchema),
    v.minLength(1),
    v.maxLength(MAX_ROOM_SELECTION_COUNT),
    v.check((roomIds) => new Set(roomIds).size === roomIds.length),
  ),
  sourceId: taskIdSchema,
  createdBy: taskIdSchema,
  url: instagramUrlSchema,
});

export type PinExtractionTask = v.InferOutput<typeof pinExtractionTaskSchema>;
