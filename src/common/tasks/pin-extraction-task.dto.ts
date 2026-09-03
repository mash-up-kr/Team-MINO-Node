import * as v from "valibot";
import { instagramUrlSchema } from "../instagram/instagram-url.dto";

const taskIdSchema = v.pipe(v.string(), v.uuid());

export const pinExtractionTaskSchema = v.object({
  roomIds: v.pipe(
    v.array(taskIdSchema),
    v.minLength(1),
    v.check((roomIds) => new Set(roomIds).size === roomIds.length),
  ),
  sourceId: taskIdSchema,
  createdBy: taskIdSchema,
  url: instagramUrlSchema,
  // 저장 시도 시작 시각. sourceId는 게시물 URL당 하나라 시도를 가르지 못한다.
  enqueuedAt: v.optional(v.pipe(v.string(), v.isoTimestamp())),
});

export type PinExtractionTask = v.InferOutput<typeof pinExtractionTaskSchema>;
