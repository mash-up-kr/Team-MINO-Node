import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { OkResult } from "../../common/dto/common.dto";
import { ValibotPipe } from "../../common/pipes/valibot.pipe";
import {
  dataArraySchema,
  ERROR_RESPONSE_SCHEMA,
  OK_RESPONSE_SCHEMA,
} from "../../common/swagger/api-response";
import type { Card } from "../pin/pin.dto";
import { cardResponseApiSchema } from "../pin/pin.dto";
import { MOCK_CARDS } from "../pin/pin.mock";
import {
  type CreatePinByLinkRequest,
  createPinByLinkRequestApiSchema,
  createPinByLinkRequestSchema,
} from "./room.dto";

// TODO(mock): swagger.yaml 계약 기준 고정 응답. 피쳐 PR에서 service 호출로 교체.
// 일부 오퍼레이션([TBD] 링크 분석 접수·홈 카드 피드)은 잠정 계약 — 기획 확정 시 계약 변경 가능.
@ApiBearerAuth()
@Controller("api/v1/rooms")
export class RoomController {
  @Post(":roomId/pins")
  @HttpCode(202)
  @ApiTags("LinkAnalysis")
  @ApiOperation({
    summary: "[TBD] 링크로 핀 생성 요청 (링크 분석, 비동기 접수)",
    description:
      "**TBD — 링크 분석 계약은 기획/설계 변경 여지가 있어 잠정이다.**\n공유/붙여넣기된 링크를 접수해 방에 핀을 생성하는 비동기 요청. enqueue 전에 `roomId`에 대한 요청 유저의 멤버십을 검증한다.\n서버는 `sources` 등록과 Cloud Tasks enqueue까지만 동기로 수행하고 즉시 응답한다.\n**별도 상태 조회 API는 없다** — 처리 결과는 푸시(중복·실패)와 알림함으로 안내한다.\n백그라운드 처리는 Cloud Tasks 워커(내부 전용 엔드포인트, 외부 비공개·스펙 비공개)가 수행한다.\nMVP 지원 출처는 인스타그램 링크뿐이며 그 외 URL은 명시적으로 거절한다.\n한 게시물에서 장소가 여러 개 추출되는 경우의 처리(핀 N개·부분 성공·푸시 횟수)는 미결 — 확정 후 계약에 반영.",
  })
  @ApiBody({ schema: createPinByLinkRequestApiSchema })
  @ApiResponse({
    status: 202,
    description: "접수됨",
    schema: OK_RESPONSE_SCHEMA,
  })
  @ApiResponse({
    status: 400,
    description: "잘못된 요청",
    schema: ERROR_RESPONSE_SCHEMA,
  })
  @ApiResponse({
    status: 403,
    description: "권한 없음 (멤버십/방장/작성자 검증 실패)",
    schema: ERROR_RESPONSE_SCHEMA,
  })
  async createPinByLink(
    @Param("roomId") _roomId: string,
    @Body(new ValibotPipe(createPinByLinkRequestSchema))
    _body: CreatePinByLinkRequest,
  ): Promise<OkResult> {
    return { ok: true };
  }

  @Get(":roomId/cards")
  @ApiTags("Pin")
  @ApiOperation({
    summary: "[TBD] 홈 카드 피드 조회",
    description:
      "**TBD — 홈 카드 큐레이션 기획 변경 진행 중.** 라벨 그룹 4종(클릭수/코멘트수/중복 저장/오래된 랜덤)\n큐레이션이 후보로 등장했으나 확정 전이라 파라미터·응답 구성은 잠정이다.\n확정분: 카드 10개 노출, 재생성 시 사용자별 접근 기록으로 이미 본 카드 제외, 개인별 큐레이션.",
  })
  @ApiResponse({
    status: 200,
    description: "카드 10개 (잠정)",
    schema: dataArraySchema(cardResponseApiSchema),
  })
  @ApiResponse({
    status: 403,
    description: "권한 없음 (멤버십/방장/작성자 검증 실패)",
    schema: ERROR_RESPONSE_SCHEMA,
  })
  async getCards(@Param("roomId") _roomId: string): Promise<Card[]> {
    return MOCK_CARDS;
  }
}
