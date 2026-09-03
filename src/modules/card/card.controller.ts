import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCurrentUser } from "../../common/decorators/require-current-user.decorator";
import type { RequestUser } from "../../common/guards/current-user.guard";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import { QuerySchema } from "../../common/swagger/query-schema.decorator";
import {
  cardListResponseApiSchema,
  errorResponseApiSchema,
  type ListCardsQuery,
  listCardsQuerySchema,
  uuidParamSchema,
} from "./card.dto";
import { CardService } from "./card.service";
import type { CardListResponse } from "./card.type";

@ApiTags("card")
@RequireCurrentUser()
@Controller("api/v1/rooms")
export class CardController {
  constructor(private readonly cardService: CardService) {}

  @Get(":roomId/cards")
  @ApiOperation({
    summary: "홈 카드 피드 조회",
    description:
      "sort로 후보를 좁힌 뒤 장소분류 라벨 4종으로 최대 10장의 덱을 만든다. " +
      "정원이 미달인 그룹은 채우지 않으므로 10장보다 짧을 수 있다. " +
      "room은 홈 헤더(방 캐릭터·뱃지)용 메타 — 캐릭터는 room.color에서 파생되는 클라이언트 에셋이다.",
  })
  @ApiResponse({ status: 200, schema: cardListResponseApiSchema })
  @ApiResponse({
    status: 400,
    description: "sort=nearby인데 좌표 누락 (VALIDATION_ERROR)",
    schema: errorResponseApiSchema,
  })
  @ApiResponse({
    status: 403,
    description: "방의 멤버가 아님 (NOT_ROOM_MEMBER)",
    schema: errorResponseApiSchema,
  })
  listCards(
    @CurrentUser() user: RequestUser,
    @Param("roomId", new ValibotPipe(uuidParamSchema)) roomId: string,
    @QuerySchema(listCardsQuerySchema) query: ListCardsQuery,
  ): Promise<CardListResponse> {
    return this.cardService.listCards(user.id, roomId, query);
  }
}
