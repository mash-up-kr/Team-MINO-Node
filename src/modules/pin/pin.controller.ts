import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import type { RequestUser } from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  type DuplicatePinRequest,
  duplicatePinRequestApiSchema,
  duplicatePinRequestSchema,
  errorResponseApiSchema,
  type ListPinsQuery,
  listPinsQuerySchema,
  okResponseApiSchema,
  pinDetailResponseApiSchema,
  pinListResponseApiSchema,
  uuidParamSchema,
} from "./pin.dto";
import { PinService } from "./pin.service";
import type { PinDetailResponse, PinListResponse } from "./pin.type";

const OK = { ok: true } as const;

@ApiTags("pin")
@RequireCurrentUser()
@Controller("api/v1/pins")
export class PinController {
  constructor(private readonly pinService: PinService) {}

  @Get()
  @ApiOperation({
    summary: "핀 목록 조회",
    description:
      "roomId의 핀 목록(좌표 포함). page/pageSize 미지정 시 전체 반환(지도 전체 보기), 지정 시 offset 페이지네이션.",
  })
  @ApiResponse({ status: 200, schema: pinListResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  listPins(
    @CurrentUser() user: RequestUser,
    @Query(new ValibotPipe(listPinsQuerySchema)) query: ListPinsQuery,
  ): Promise<PinListResponse> {
    return this.pinService.listPins(user.id, query);
  }

  @Get(":pinId")
  @ApiOperation({
    summary: "장소(핀) 상세 조회",
    description: "장소 정보(places 컬럼 전체) + 출처 링크 + 저장한 멤버 프로필",
  })
  @ApiResponse({ status: 200, schema: pinDetailResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  @ApiResponse({ status: 404, schema: errorResponseApiSchema })
  getPinDetail(
    @CurrentUser() user: RequestUser,
    @Param("pinId", new ValibotPipe(uuidParamSchema)) pinId: string,
  ): Promise<PinDetailResponse> {
    return this.pinService.getPinDetail(user.id, pinId);
  }

  @Post(":pinId/duplicate")
  @HttpCode(200)
  @ApiOperation({
    summary: '다른 방에 핀 복제 ("다른 방에 공유")',
    description:
      "원본 방·모든 대상 방 멤버십 검증. 대상 방 중 하나라도 같은 장소가 있으면 409로 전체 거절.",
  })
  @ApiBody({ schema: duplicatePinRequestApiSchema })
  @ApiResponse({ status: 200, schema: okResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  @ApiResponse({
    status: 409,
    description: "DUPLICATE_PIN_IN_ROOM",
    schema: errorResponseApiSchema,
  })
  async duplicatePin(
    @CurrentUser() user: RequestUser,
    @Param("pinId", new ValibotPipe(uuidParamSchema)) pinId: string,
    @Body(new ValibotPipe(duplicatePinRequestSchema))
    body: DuplicatePinRequest,
  ): Promise<typeof OK> {
    await this.pinService.duplicatePin(user.id, pinId, body);
    return OK;
  }

  @Post(":pinId/accesses")
  @HttpCode(200)
  @ApiOperation({
    summary: "핀 접근 기록 (사용자별)",
    description:
      "홈 카드 덱의 묵힘 계산과 클릭수 집계의 원천. append-only 로그.",
  })
  @ApiResponse({ status: 200, schema: okResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  async recordAccess(
    @CurrentUser() user: RequestUser,
    @Param("pinId", new ValibotPipe(uuidParamSchema)) pinId: string,
  ): Promise<typeof OK> {
    await this.pinService.recordAccess(user.id, pinId);
    return OK;
  }
}
