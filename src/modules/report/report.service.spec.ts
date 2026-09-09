import { describe, expect, it } from "bun:test";
import { HttpStatus } from "@nestjs/common";
import type { RequestUser } from "../../common/guards/current-user.guard";
import type {
  ReportRepository,
  SubmitReportInput,
  SubmitReportResult,
} from "./report.repository";
import { REPORT_DAILY_LIMIT, ReportService } from "./report.service";

const user: RequestUser = {
  id: "reporter-id",
  nickname: "신고자",
  avatar: null,
};

const baseRequest = {
  targetType: "user",
  targetId: "target-user-id",
  reason: "SPAM",
} as const;

/*
 * stub의 submit 시그니처에 실제 타입(SubmitReportInput/SubmitReportResult)을
 * 물려 둔다. repository 시그니처가 바뀌면 여기서 컴파일이 깨져 거짓 양성을 막는다.
 */
function createService(
  submit: (input: SubmitReportInput) => Promise<SubmitReportResult>,
): { service: ReportService; inputs: SubmitReportInput[] } {
  const inputs: SubmitReportInput[] = [];
  const repository = {
    submit: (input: SubmitReportInput) => {
      inputs.push(input);
      return submit(input);
    },
  } as unknown as ReportRepository;
  return { service: new ReportService(repository), inputs };
}

async function errorOf(promise: Promise<unknown>): Promise<{
  status: number;
  body: unknown;
}> {
  try {
    await promise;
  } catch (error) {
    const http = error as {
      getStatus(): number;
      getResponse(): unknown;
    };
    return { status: http.getStatus(), body: http.getResponse() };
  }
  throw new Error("예외가 발생해야 한다");
}

describe("ReportService.create", () => {
  it("접수에 성공하면 id·상태·시각을 돌려준다", async () => {
    const createdAt = new Date("2026-09-09T00:00:00.000Z");
    const { service, inputs } = createService(async () => ({
      kind: "created",
      id: "report-id",
      createdAt,
    }));

    const result = await service.create(user, { ...baseRequest });

    expect(result).toEqual({ id: "report-id", status: "pending", createdAt });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      reporterId: user.id,
      targetType: "user",
      targetId: "target-user-id",
      dailyLimit: REPORT_DAILY_LIMIT,
    });
  });

  it("중복 pending 신고는 409로 거절한다", async () => {
    const { service } = createService(async () => ({ kind: "duplicate" }));

    const { status, body } = await errorOf(
      service.create(user, { ...baseRequest }),
    );

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body).toMatchObject({ errorCode: "REPORT_ALREADY_EXISTS" });
  });

  it("24시간 한도를 넘기면 429로 거절한다", async () => {
    const { service } = createService(async () => ({ kind: "rate_limited" }));

    const { status, body } = await errorOf(
      service.create(user, { ...baseRequest }),
    );

    expect(status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(body).toMatchObject({ errorCode: "REPORT_RATE_LIMITED" });
  });

  it("자기 신고는 400으로 거절한다", async () => {
    const { service } = createService(async () => ({ kind: "self" }));

    const { status, body } = await errorOf(
      service.create(user, { ...baseRequest }),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({ errorCode: "SELF_REPORT_NOT_ALLOWED" });
  });

  it("탈퇴 경합은 401로 내린다", async () => {
    const { service } = createService(async () => ({
      kind: "unknown_reporter",
    }));

    const { status, body } = await errorOf(
      service.create(user, { ...baseRequest }),
    );

    expect(status).toBe(HttpStatus.UNAUTHORIZED);
    expect(body).toMatchObject({ errorCode: "UNIDENTIFIED_USER" });
  });
});
