import type { PlaceJob, PlaceJobStatus } from "./place.schema";
import type { PlaceMatch } from "./place.type";

export interface PlaceJobResponse {
  jobId: string;
  status: PlaceJobStatus;
  result: PlaceMatch[] | null;
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
    errorMessage: toPublicErrorMessage(job),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function toPublicErrorMessage(job: PlaceJob): string | null {
  if (!job.errorCode) return null;
  if (job.status === "pending") {
    return "일시적인 오류가 발생해 다시 시도하고 있습니다.";
  }
  if (job.status === "failed") {
    return "장소 추출 작업에 실패했습니다.";
  }
  return null;
}
