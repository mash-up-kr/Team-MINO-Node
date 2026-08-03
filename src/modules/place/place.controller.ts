import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AppException } from "../../common/exceptions/app.exception";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { TasksService } from "../../infrastructures/tasks/tasks.service";
import {
  acceptedResponseApiSchema,
  type CreatePlaceRequest,
  createPlaceRequestApiSchema,
  createPlaceRequestSchema,
  errorResponseApiSchema,
} from "./place.dto";

@ApiTags("place")
@Controller("api/v1/place")
export class PlaceController {
  constructor(private readonly tasksService: TasksService) {}

  @Post("places")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "인스타그램 URL에서 장소 추출을 enqueue한다",
    description:
      "장소 추출을 Cloud Tasks에 enqueue하고 { data: { ok: true } }와 함께 202를 반환한다. 추출과 최종 결과 저장은 Internal endpoint에서 수행한다.",
  })
  @ApiBody({ schema: createPlaceRequestApiSchema })
  @ApiResponse({
    status: 202,
    description: "Cloud Tasks enqueue 완료",
    schema: acceptedResponseApiSchema,
  })
  @ApiResponse({
    status: 400,
    description: "요청 형식 오류 (VALIDATION_ERROR / INVALID_INSTAGRAM_URL)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 502,
    description: "큐 등록 실패 (ENQUEUE_FAILED)",
    schema: errorResponseApiSchema,
  })
  async createPlace(
    @Body(new ValibotPipe(createPlaceRequestSchema)) body: CreatePlaceRequest,
  ): Promise<{ ok: true }> {
    try {
      await this.tasksService.enqueuePlaceExtraction(body.url);
    } catch {
      throw new AppException(
        "ENQUEUE_FAILED",
        "작업을 큐에 등록하지 못했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }
    return { ok: true };
  }
}
