import * as v from "valibot";

export const createPlaceRequestSchema = v.object({
  method: v.picklist(["instagram_url"]),
  data: v.object({
    url: v.pipe(v.string(), v.url(), v.regex(/instagram\.com/)),
  }),
});

export type CreatePlaceRequest = v.InferOutput<typeof createPlaceRequestSchema>;
