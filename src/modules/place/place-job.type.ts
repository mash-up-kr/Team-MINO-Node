import type { PlaceJob, placeJobStatus } from "./place.schema";
import type { PlaceCandidate } from "./place.type";

export type PlaceJobStatus = (typeof placeJobStatus.enumValues)[number];

export interface PlaceJobResponse {
  jobId: string;
  status: PlaceJobStatus;
  result: PlaceCandidate[] | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPlaceJobResponse(job: PlaceJob): PlaceJobResponse {
  return {
    jobId: job.id,
    status: job.status,
    result: job.result ?? null,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
