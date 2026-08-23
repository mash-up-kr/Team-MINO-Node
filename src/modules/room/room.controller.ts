import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import type { RequestUser } from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  type CreateRoomRequest,
  createRoomRequestApiSchema,
  createRoomRequestSchema,
  errorResponseApiSchema,
  type ListRoomsQuery,
  listRoomsQuerySchema,
  okResponseApiSchema,
  roomDetailResponseApiSchema,
  roomListResponseApiSchema,
  roomMemberListResponseApiSchema,
  roomResponseApiSchema,
  type TransferOwnerRequest,
  transferOwnerRequestApiSchema,
  transferOwnerRequestSchema,
  type UpdateRoomRequest,
  updateRoomRequestApiSchema,
  updateRoomRequestSchema,
  uuidParamSchema,
} from "./room.dto";
import { RoomService } from "./room.service";
import type {
  RoomDetailResponse,
  RoomMemberResponse,
  RoomResponse,
  RoomSummaryResponse,
} from "./room.type";

const OK = { ok: true } as const;

@ApiTags("room")
@RequireCurrentUser()
@Controller("api/v1/rooms")
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  @ApiOperation({
    summary: "공동방 생성",
    description: "생성자가 방장(owner)이 된다.",
  })
  @ApiBody({ schema: createRoomRequestApiSchema })
  @ApiResponse({ status: 201, schema: roomResponseApiSchema })
  createRoom(
    @CurrentUser() user: RequestUser,
    @Body(new ValibotPipe(createRoomRequestSchema)) body: CreateRoomRequest,
  ): Promise<RoomResponse> {
    return this.roomService.createRoom(user.id, body);
  }

  @Get()
  @ApiOperation({
    summary: "내가 속한 방 목록",
    description:
      "나간 방은 제외. ?showHasPlaceId=로 장소 저장 여부, ?showUsers=true로 멤버 목록 포함.",
  })
  @ApiResponse({ status: 200, schema: roomListResponseApiSchema })
  listRooms(
    @CurrentUser() user: RequestUser,
    @Query(new ValibotPipe(listRoomsQuerySchema)) query: ListRoomsQuery,
  ): Promise<RoomSummaryResponse[]> {
    return this.roomService.listRooms(user.id, query);
  }

  @Get(":roomId")
  @ApiOperation({
    summary: "방 상세 조회",
    description:
      "방 정보 + 핀 수·멤버 수 메타. 핀 목록은 GET /api/v1/pins?roomId=로 별도 조회.",
  })
  @ApiResponse({ status: 200, schema: roomDetailResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  @ApiResponse({ status: 404, schema: errorResponseApiSchema })
  getRoomDetail(
    @CurrentUser() user: RequestUser,
    @Param("roomId", new ValibotPipe(uuidParamSchema)) roomId: string,
  ): Promise<RoomDetailResponse> {
    return this.roomService.getRoomDetail(user.id, roomId);
  }

  @Patch(":roomId")
  @ApiOperation({ summary: "방 편집 (방장만)" })
  @ApiBody({ schema: updateRoomRequestApiSchema })
  @ApiResponse({ status: 200, schema: roomResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  updateRoom(
    @CurrentUser() user: RequestUser,
    @Param("roomId", new ValibotPipe(uuidParamSchema)) roomId: string,
    @Body(new ValibotPipe(updateRoomRequestSchema)) body: UpdateRoomRequest,
  ): Promise<RoomResponse> {
    return this.roomService.updateRoom(user.id, roomId, body);
  }

  @Put(":roomId/owner")
  @ApiOperation({
    summary: "방장 위임 (방장만)",
    description: "방장이 방을 나가려면 먼저 이 API로 위임을 완료해야 한다.",
  })
  @ApiBody({ schema: transferOwnerRequestApiSchema })
  @ApiResponse({ status: 200, schema: okResponseApiSchema })
  @ApiResponse({ status: 400, schema: errorResponseApiSchema })
  @ApiResponse({ status: 403, schema: errorResponseApiSchema })
  async transferOwner(
    @CurrentUser() user: RequestUser,
    @Param("roomId", new ValibotPipe(uuidParamSchema)) roomId: string,
    @Body(new ValibotPipe(transferOwnerRequestSchema))
    body: TransferOwnerRequest,
  ): Promise<typeof OK> {
    await this.roomService.transferOwner(user.id, roomId, body);
    return OK;
  }

  @Delete(":roomId/members/me")
  @ApiOperation({
    summary: "방 나가기",
    description:
      "일반 멤버는 나가기. 방장+다른 멤버 존재 시 409(위임 선행). 방장+마지막 멤버면 방 삭제.",
  })
  @ApiResponse({ status: 200, schema: okResponseApiSchema })
  @ApiResponse({
    status: 409,
    description: "방장이 위임 없이 나가기를 요청 (OWNER_TRANSFER_REQUIRED)",
    schema: errorResponseApiSchema,
  })
  async leaveRoom(
    @CurrentUser() user: RequestUser,
    @Param("roomId", new ValibotPipe(uuidParamSchema)) roomId: string,
  ): Promise<typeof OK> {
    await this.roomService.leaveRoom(user.id, roomId);
    return OK;
  }

  @Get(":roomId/members")
  @ApiOperation({ summary: "방 멤버 목록 (방장 위임 대상 선택 모달용)" })
  @ApiResponse({ status: 200, schema: roomMemberListResponseApiSchema })
  listMembers(
    @CurrentUser() user: RequestUser,
    @Param("roomId", new ValibotPipe(uuidParamSchema)) roomId: string,
  ): Promise<RoomMemberResponse[]> {
    return this.roomService.listMembers(user.id, roomId);
  }
}
