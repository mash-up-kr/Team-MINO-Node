import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  type CreatePlaceRequest,
  createPlaceRequestApiSchema,
  createPlaceRequestSchema,
  createPlaceResponseApiSchema,
  errorResponseApiSchema,
} from "./place.dto";
import { PlaceJobService } from "./place-job.service";

@ApiTags("place")
@Controller("api/v1/place")
export class PlaceController {
  constructor(private readonly placeJobService: PlaceJobService) {}

  @Post("places")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "인스타그램 URL에서 장소 추출 job을 생성한다",
    description:
      "비동기 job을 만들고 즉시 jobId를 반환한다. 추출(scrap → AI extraction → geocoding fan-out)은 워커에서 진행되며, GET /api/v1/place/jobs/:jobId로 폴링해 결과를 받는다. 동일 게시글 재요청은 진행 중/완료된 jobId를 재사용한다.",
  })
  @ApiBody({ schema: createPlaceRequestApiSchema })
  @ApiResponse({
    status: 202,
    description: "생성되거나 재사용된 job의 id",
    schema: createPlaceResponseApiSchema,
  })
  @ApiResponse({
    status: 400,
    description: "요청 형식 오류 (VALIDATION_ERROR / INVALID_INSTAGRAM_URL)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 409,
    description: "job 생성 경합 (PLACE_JOB_CONFLICT, 재시도 필요)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 502,
    description: "큐 등록 실패 (ENQUEUE_FAILED)",
    schema: errorResponseApiSchema,
  })
  async createPlace(
    @Body(new ValibotPipe(createPlaceRequestSchema)) body: CreatePlaceRequest,
  ): Promise<{ jobId: string }> {
    switch (body.method) {
      case "instagram_url":
        return this.placeJobService.createJob(body.data.url);
      default:
        throw new Error(`Unsupported method: ${body.method}`);
    }
  }
}
