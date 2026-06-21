import * as v from "valibot";
import type { GeoCandidate } from "../../infrastructures/geocoder/geocoder.type";

export const placeQuerySchema = v.object({
  place_name: v.pipe(
    v.string(),
    v.description(
      "The specific name of the place, e.g. a restaurant, cafe, or shop name.",
    ),
  ),
  area_name: v.pipe(
    v.string(),
    v.description(
      "The surrounding area, neighborhood, or address hint for the place.",
    ),
  ),
  area_type: v.pipe(
    v.picklist(["landmark", "address", "region"]),
    v.description(
      'How area_name is expressed: "landmark" for a well-known place, "address" for a street address, "region" for a broad area such as a district or city.',
    ),
  ),
  relation: v.pipe(
    v.string(),
    v.description(
      "A short phrase describing how the place relates to the post content.",
    ),
  ),
});

export type PlaceQuery = v.InferOutput<typeof placeQuerySchema>;

/** Wrapped in an object so structured output uses the provider-friendly object mode. */
export const placeExtractionSchema = v.object({
  places: v.pipe(
    v.array(placeQuerySchema),
    v.description("Every distinct real-world place featured in the post."),
  ),
});

export type PlaceExtractionResult = v.InferOutput<typeof placeExtractionSchema>;

export interface PlaceCandidate extends GeoCandidate {}
