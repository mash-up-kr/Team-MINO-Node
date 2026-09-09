import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import type { RequestUser } from "../../common/guards/current-user.guard";
import type { CreateReportRequest } from "./report.dto";
import { ReportRepository } from "./report.repository";
import type { ReportResponse } from "./report.type";

/*
 * 24시간 동안 한 신고자가 접수할 수 있는 최대 건수.
 * 정상 유저의 신고 빈도(연간 한 자릿수)와 어뷰즈 차단 사이에서 넉넉히 잡은 값이다.
 * 운영 지표를 보고 조정하고, 조정 빈도가 생기면 env로 승격한다 (지금은 상수).
 */
export const REPORT_DAILY_LIMIT = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReportService {
  constructor(private readonly reportRepository: ReportRepository) {}

  async create(
    user: RequestUser,
    request: CreateReportRequest,
  ): Promise<ReportResponse> {
    const result = await this.reportRepository.submit({
      reporterId: user.id,
      targetType: request.targetType,
      targetId: request.targetId,
      reason: request.reason,
      detail: request.detail,
      dailyLimit: REPORT_DAILY_LIMIT,
      windowStart: new Date(Date.now() - DAY_MS),
    });

    switch (result.kind) {
      case "created":
        return {
          id: result.id,
          status: "pending",
          createdAt: result.createdAt,
        };
      case "duplicate":
        throw new AppException(
          "REPORT_ALREADY_EXISTS",
          "이미 접수된 신고입니다.",
          HttpStatus.CONFLICT,
        );
      case "rate_limited":
        throw new AppException(
          "REPORT_RATE_LIMITED",
          "신고 접수 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case "self":
        throw new AppException(
          "SELF_REPORT_NOT_ALLOWED",
          "자기 자신은 신고할 수 없습니다.",
          HttpStatus.BAD_REQUEST,
        );
      case "unknown_reporter":
        throw new AppException(
          "UNIDENTIFIED_USER",
          "등록되지 않은 유저입니다.",
          HttpStatus.UNAUTHORIZED,
        );
    }
  }
}
