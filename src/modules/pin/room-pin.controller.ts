import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import { AppException } from "../../common/exceptions/app.exception";
import type { RequestUser } from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  type CreateRoomPinsRequest,
  createRoomPinsRequestApiSchema,
  createRoomPinsRequestSchema,
  errorResponseApiSchema,
} from "./pin.dto";
import { PinService } from "./pin.service";

const OK = { ok: true } as const;

@ApiTags("pin")
@RequireCurrentUser()
@Controller("api/v1/rooms")
export class RoomPinController {
  private readonly logger = new Logger(RoomPinController.name);

  constructor(private readonly pinService: PinService) {}

  @Post("pins")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "인스타그램 링크에서 장소를 추출해 여러 방에 핀을 추가한다",
    description:
      "인스타그램 게시물 링크가 아니면 400이 아니라 202를 반환하고 SAVE_FAILED 알림을 보낸다. " +
      "400은 roomIds가 잘못된 경우에만 나온다.",
  })
  @ApiBody({ schema: createRoomPinsRequestApiSchema })
  @ApiResponse({
    status: 202,
    description: "장소 추출 작업 등록 완료. 지원하지 않는 링크도 202다.",
  })
  @ApiResponse({ status: 400, schema: errorResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  @ApiResponse({ status: 502, schema: errorResponseApiSchema })
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ValibotPipe(createRoomPinsRequestSchema))
    body: CreateRoomPinsRequest,
  ): Promise<typeof OK> {
    try {
      await this.pinService.enqueueRoomPins(user.id, body);
    } catch (error) {
      if (error instanceof AppException && error.getStatus() < 500) {
        throw error;
      }
      this.logger.error(
        { err: error, roomIds: body.roomIds, userId: user.id },
        "Failed to enqueue pin extraction task",
      );
      throw new AppException(
        "ENQUEUE_FAILED",
        "작업을 큐에 등록하지 못했습니다.",
        HttpStatus.BAD_GATEWAY,
      );
    }
    return OK;
  }
}
