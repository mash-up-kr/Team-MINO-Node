import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import { AppException } from "../../common/exceptions/app.exception";
import type { RequestUser } from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  type CreateRoomPinRequest,
  createRoomPinRequestApiSchema,
  createRoomPinRequestSchema,
  errorResponseApiSchema,
  uuidParamSchema,
} from "./pin.dto";
import { PinService } from "./pin.service";

const OK = { ok: true } as const;

@ApiTags("pin")
@RequireCurrentUser()
@Controller("api/v1/rooms")
export class RoomPinController {
  constructor(private readonly pinService: PinService) {}

  @Post(":roomId/pins")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "인스타그램 링크에서 장소를 추출해 방에 핀을 추가한다",
  })
  @ApiBody({ schema: createRoomPinRequestApiSchema })
  @ApiResponse({ status: 202, description: "장소 추출 작업 등록 완료" })
  @ApiResponse({ status: 400, schema: errorResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  @ApiResponse({ status: 502, schema: errorResponseApiSchema })
  async create(
    @CurrentUser() user: RequestUser,
    @Param("roomId", new ValibotPipe(uuidParamSchema)) roomId: string,
    @Body(new ValibotPipe(createRoomPinRequestSchema))
    body: CreateRoomPinRequest,
  ): Promise<typeof OK> {
    try {
      await this.pinService.enqueueRoomPin(user.id, roomId, body);
    } catch (error) {
      if (error instanceof AppException && error.getStatus() < 500) {
        throw error;
      }
      throw new AppException(
        "ENQUEUE_FAILED",
        "작업을 큐에 등록하지 못했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }
    return OK;
  }
}
