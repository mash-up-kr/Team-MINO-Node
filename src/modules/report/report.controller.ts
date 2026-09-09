import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import type { RequestUser } from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  type CreateReportRequest,
  createReportRequestApiSchema,
  createReportRequestSchema,
  duplicateReportResponseApiSchema,
  rateLimitedResponseApiSchema,
  reportResponseApiSchema,
  unidentifiedUserResponseApiSchema,
  validationErrorResponseApiSchema,
} from "./report.dto";
import { ReportService } from "./report.service";
import type { ReportResponse } from "./report.type";

@ApiTags("report")
@Controller("api/v1/reports")
@RequireCurrentUser()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "신고 접수",
    description:
      "핀/핀 코멘트/유저를 신고한다. 타겟이 없어도 접수되며(유저 열거 방지), " +
      "같은 타겟의 pending 신고가 있으면 409를 돌려준다.",
  })
  @ApiBody({ schema: createReportRequestApiSchema })
  @ApiResponse({ status: 201, schema: reportResponseApiSchema })
  @ApiResponse({ status: 400, schema: validationErrorResponseApiSchema })
  @ApiResponse({ status: 401, schema: unidentifiedUserResponseApiSchema })
  @ApiResponse({ status: 409, schema: duplicateReportResponseApiSchema })
  @ApiResponse({ status: 429, schema: rateLimitedResponseApiSchema })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ValibotPipe(createReportRequestSchema))
    request: CreateReportRequest,
  ): Promise<ReportResponse> {
    return this.reportService.create(user, request);
  }
}
